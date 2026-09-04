// CINC Systems API proxy for the HOA Financial Review app.
//
// Holds the CINC OAuth client credentials server-side (never sent to the browser) and exposes
// two narrow read-only routes the app calls to pull the monthly "Group Reports" financials batch:
//   GET /api/cinc/list?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD  -> [{ description, fileId }]
//   GET /api/cinc/document?fileId=<id>                          -> { fileId, items: [{ associationName, base64 }] }
//
// Auth: browser sends a static shared secret in the X-App-Token header, checked against
// env.APP_SHARED_TOKEN. This mirrors the existing Anthropic-key-in-localStorage pattern the
// app already uses — same trust model, no new risk class.

const CINC_TOKEN_URL = 'https://identity.cincsys.com/connect/token';
const CINC_BASE_URL = 'https://pmi.cincsys.com/api/management/1';
const CINC_GROUP_REPORTS_TYPE = 'Group Reports';

const ALLOWED_ORIGINS = ['https://pmineatl.github.io', 'http://localhost:8080'];

// Best-effort token cache across warm invocations of the same isolate. If the isolate recycles,
// this is just null again and we re-fetch — no correctness impact, just saves a round trip.
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getCincToken(env) {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.CINC_CLIENT_ID,
    client_secret: env.CINC_CLIENT_SECRET,
    scope: 'cincapi.all'
  });

  const res = await fetch(CINC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) throw new Error(`CINC auth failed (${res.status})`);
  const data = await res.json();
  cachedToken = data.access_token;
  // Refresh a minute early to avoid edge-of-expiry failures.
  cachedTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const headers = {};
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function jsonResponse(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
  });
}

function checkAuth(request, env) {
  const token = request.headers.get('X-App-Token');
  return token && env.APP_SHARED_TOKEN && token === env.APP_SHARED_TOKEN;
}

async function handleList(request, env) {
  if (!checkAuth(request, env)) return jsonResponse(request, 401, { error: 'Unauthorized' });

  const url = new URL(request.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  if (!startDate || !endDate) {
    return jsonResponse(request, 400, { error: 'startDate and endDate are required (YYYY-MM-DD).' });
  }

  try {
    const token = await getCincToken(env);
    const cincUrl = new URL(`${CINC_BASE_URL}/documentIds`);
    cincUrl.searchParams.set('startDate', startDate);
    cincUrl.searchParams.set('endDate', endDate);
    cincUrl.searchParams.set('type', CINC_GROUP_REPORTS_TYPE);

    const res = await fetch(cincUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) {
      // Relay CINC's own error text (e.g. "Date range is too big...") so the UI can show it directly.
      return jsonResponse(request, res.status, { error: text.replace(/^"|"$/g, '') });
    }
    const data = JSON.parse(text);
    const items = (Array.isArray(data) ? data : []).map(d => ({ description: d.Description, fileId: d.FileId }));
    return jsonResponse(request, 200, items);
  } catch (err) {
    return jsonResponse(request, 502, { error: 'Failed to reach CINC: ' + err.message });
  }
}

async function handleDocument(request, env) {
  if (!checkAuth(request, env)) return jsonResponse(request, 401, { error: 'Unauthorized' });

  const url = new URL(request.url);
  const fileId = url.searchParams.get('fileId');
  if (!fileId) return jsonResponse(request, 400, { error: 'fileId is required.' });

  try {
    const token = await getCincToken(env);
    const res = await fetch(`${CINC_BASE_URL}/documents/${encodeURIComponent(fileId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await res.text();
    if (!res.ok) {
      return jsonResponse(request, res.status, { error: text.replace(/^"|"$/g, '') });
    }
    const data = JSON.parse(text);
    const items = (Array.isArray(data) ? data : [])
      // Filter to real PDFs with a known association, server-side, before this ever reaches
      // the browser. Base64 for "%PDF" starts with "JVBER" — checkable on the string directly.
      .filter(d => d.AssociationName && typeof d.DocumentData === 'string' && d.DocumentData.startsWith('JVBER'))
      .map(d => ({ associationName: d.AssociationName, base64: d.DocumentData }));
    return jsonResponse(request, 200, { fileId, items });
  } catch (err) {
    return jsonResponse(request, 502, { error: 'Failed to reach CINC: ' + err.message });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      const headers = { ...corsHeaders(request) };
      if (headers['Access-Control-Allow-Origin']) {
        headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'X-App-Token';
        headers['Access-Control-Max-Age'] = '86400';
      }
      return new Response(null, { status: 204, headers });
    }

    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/api/cinc/list') return handleList(request, env);
    if (request.method === 'GET' && pathname === '/api/cinc/document') return handleDocument(request, env);

    return jsonResponse(request, 404, { error: 'Not found' });
  }
};
