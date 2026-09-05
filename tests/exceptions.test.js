// Unit tests for the exception rules.
//
//   node tests/exceptions.test.js
//
// No API key, no network, no client data. The community names below are the
// three real exception cases in shape only - two communities whose names share
// the words "Country Club", which is the case that makes substring matching
// unsafe - with invented names.

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'hoa-financial-review.html');
const src = fs.readFileSync(APP, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));

// The exception engine shares normCommunity with the manager layer - the two
// have to agree on what counts as the same community - so both blocks are
// evaluated together, inside their own scope.
const api = new Function('localStorage', 'document', [
  cut('// ===== MANAGER ASSIGNMENTS =====', '// ===== MANAGER ASSIGNMENTS UI ====='),
  cut('// ===== FINDINGS ENGINE =====', '// ===== EXCEPTIONS ====='),
  cut('// ===== EXCEPTIONS =====', '// ===== EXTRACTION ====='),
  'return { buildFindings, parseExceptionRule, applyExceptions, resolveRuleCommunity, renderFindingCell, parseExceptionCSV, headerMap, cellText };'
].join('\n'))({ getItem: () => null, setItem: () => {} }, { getElementById: () => ({ checked: false }) });

const { buildFindings, parseExceptionRule, applyExceptions, resolveRuleCommunity,
        parseExceptionCSV, headerMap, cellText } = api;

let pass = 0, fail = 0;
function t(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  pass  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); console.log('          got:  ' + JSON.stringify(got)); console.log('          want: ' + JSON.stringify(want)); }
}
const section = n => console.log('\n' + n);
const FUTURE = '2099-12-31';

// A run shaped like a real month: two communities whose names both contain
// "Country Club", one unrelated, one with an expense variance to re-judge.
const community = (name, over) => buildFindings(Object.assign({
  communityName: name,
  balanceSheet: { operating: { totalAssets: 10, totalLiabilitiesAndEquity: 10 }, reserve: { totalAssets: 5, totalLiabilitiesAndEquity: 5 } },
  prepaid: { balanceSheetAmount: 100, homeownerListTotal: 100 },
  agingReportPresent: true, agingNegatives: []
}, over));

const run = () => [
  community('Southaven Country Club Homeowners Association, Inc.', {
    specialIncome: [{ accountNumber: '30700-00', currentPeriodActual: 1475 }]
  }),
  community('Country Club of the Pines Homeowners Association, Inc.', {
    specialIncome: [{ accountNumber: '30700-00', currentPeriodActual: 2525 }]
  }),
  community('Marlowe Woods Homeowners Association, Inc', {
    specialIncome: [{ accountNumber: '30450-00', currentPeriodActual: 4768.25 }]
  }),
  community('Ashgrove Commons Community Association, Inc.', {
    expenseAccounts: [
      { accountNumber: '40700-000', accountName: 'Insurance', currentPeriodActual: 4200, currentPeriodBudget: 3500 },   // 20%
      { accountNumber: '60400-000', accountName: 'Landscaping', currentPeriodActual: 5250, currentPeriodBudget: 3500 }  // 50%
    ]
  })
];

const parse = rows => rows.map((r, i) => {
  const out = parseExceptionRule(r, i);
  if (out.error) throw new Error('fixture rule did not parse: ' + out.error);
  return out.rule;
});

// ------------------------------------------------------------ name resolution
section('Resolving the community a rule names');
{
  const names = run().map(r => r.communityName);
  t('a short name resolves to the one community it starts',
    resolveRuleCommunity('Marlowe Woods', names).matched, ['Marlowe Woods Homeowners Association, Inc']);
  t('the full name resolves too',
    resolveRuleCommunity('Country Club of the Pines Homeowners Association, Inc.', names).matched,
    ['Country Club of the Pines Homeowners Association, Inc.']);
  t('punctuation and case are ignored',
    resolveRuleCommunity('marlowe woods homeowners association inc', names).matched,
    ['Marlowe Woods Homeowners Association, Inc']);
  // Matching is by prefix, never by substring. "Country Club" sits inside
  // "Southaven Country Club" but only starts "Country Club of the Pines", and
  // silently applying an exception to the wrong community is the worst thing
  // this feature could do.
  t('a name inside another community is never matched by accident',
    resolveRuleCommunity('Country Club', names).matched, ['Country Club of the Pines Homeowners Association, Inc.']);
  // Real rosters do carry genuine prefix collisions - two phases of the same
  // subdivision, a community and its park - so an ambiguous prefix is refused.
  const twins = ['Castleforth Homeowners Association One, Inc', 'Castleforth Homeowners Association Two, Inc.'];
  t('a prefix that fits two communities is refused, not guessed',
    !!resolveRuleCommunity('Castleforth', twins).error, true);
  t('and the refusal names the candidates',
    /Castleforth Homeowners Association One/.test(resolveRuleCommunity('Castleforth', twins).error), true);
  t('naming one of them fully resolves it',
    resolveRuleCommunity('Castleforth Homeowners Association Two', twins).matched, [twins[1]]);
  t('a community not in this run is reported',
    !!resolveRuleCommunity('Nowhere HOA', names).error, true);
}

// ------------------------------------------------------------------- parsing
section('Reading a rule');
{
  t('a reason is required',
    !!parseExceptionRule({ community: 'A', check: 'sectionA', action: 'suppress', expires: FUTURE }, 0).error, true);
  t('an expiry is required',
    !!parseExceptionRule({ community: 'A', check: 'sectionA', action: 'suppress', reason: 'contract' }, 0).error, true);
  t('an unknown check is refused',
    !!parseExceptionRule({ community: 'A', check: 'vibes', action: 'suppress', reason: 'x', expires: FUTURE }, 0).error, true);
  t('an unknown action is refused',
    !!parseExceptionRule({ community: 'A', check: 'sectionA', action: 'ignore', reason: 'x', expires: FUTURE }, 0).error, true);
  t('"Section A" is accepted the way a person writes it',
    parseExceptionRule({ community: 'A', check: 'Section A', action: 'suppress', reason: 'x', expires: FUTURE }, 0).rule.check, 'sectionA');
  t('an account suffix is normalised away',
    parseExceptionRule({ community: 'A', account: '30700-00', action: 'suppress', reason: 'x', expires: FUTURE }, 0).rule.account, '30700');
  t('a blank community means every community',
    parseExceptionRule({ account: '30700', action: 'suppress', reason: 'x', expires: FUTURE }, 0).rule.community, null);
  t('a bare threshold number is a percentage',
    parseExceptionRule({ check: 'expenseVariance', action: 'threshold', value: '25', reason: 'x', expires: FUTURE }, 0).rule.threshold,
    { unit: 'percent', amount: 25 });
  t('a dollar threshold is read as dollars',
    parseExceptionRule({ check: 'expenseVariance', action: 'threshold', value: '$2,500', reason: 'x', expires: FUTURE }, 0).rule.threshold,
    { unit: 'dollars', amount: 2500 });
  t('a threshold on a check that has no variance is refused',
    !!parseExceptionRule({ check: 'prepaid', action: 'threshold', value: '25', reason: 'x', expires: FUTURE }, 0).error, true);
}

// ------------------------------------------------------------- the real cases
section('The three real exceptions');
{
  // "Ignore income in 30700 for [two communities] due to their contracts" and
  // "[this community] will always show leasing income, so ignore that too."
  const rules = parse([
    { community: 'Southaven Country Club', check: 'sectionA', account: '30700', action: 'suppress', reason: 'Pool contract - remotes billed by the vendor', expires: FUTURE },
    { community: 'Country Club of the Pines', check: 'sectionA', account: '30700', action: 'suppress', reason: 'Pool contract - remotes billed by the vendor', expires: FUTURE },
    { community: 'Marlowe Woods', check: 'sectionA', account: '30450', action: 'suppress', reason: 'Leasing income is contractual and expected', expires: FUTURE }
  ]);
  const res = applyExceptions(run(), rules, '2026-09-05');

  t('each rule removed exactly one finding', res.applied.length, 3);
  t('the three communities now report nothing on the income statement',
    res.records.slice(0, 3).map(r => r.incomeStatement), [['OK'], ['OK'], ['OK']]);
  t('the fourth community is untouched',
    res.records[3].incomeStatement.length, 2);
  t('nothing else in those records moved',
    res.records.slice(0, 3).map(r => [r.bsOperating, r.bsReserve, r.prepaid]),
    [['OK', 'OK', 'OK'], ['OK', 'OK', 'OK'], ['OK', 'OK', 'OK']]);
  // Nothing is deleted - the report has to be able to say what it is not showing.
  t('every suppression is recorded with its reason',
    res.applied.map(a => a.rule.reason.slice(0, 14)),
    ['Pool contract ', 'Pool contract ', 'Leasing income']);
  t('and with the finding it removed',
    /Pool & Gate Remotes/.test(res.applied[0].finding.text), true);
  t('no rule is reported as unused', res.problems.filter(p => p.kind === 'unused').length, 0);

  // The whole point of the pairing: a rule for one of the two "Country Club"
  // communities must not touch the other.
  const one = applyExceptions(run(), parse([
    { community: 'Southaven Country Club', check: 'sectionA', account: '30700', action: 'suppress', reason: 'contract', expires: FUTURE }
  ]), '2026-09-05');
  t('a rule for one community leaves its near-namesake alone',
    [one.records[0].incomeStatement, one.records[1].incomeStatement],
    [['OK'], ['**Pool & Gate Remotes: 30700-00 ($2,525.00)**']]);
}

// ------------------------------------------------------------------- actions
section('Suppress, downgrade, threshold');
{
  const rules = parse([{ community: 'Ashgrove', check: 'expenseVariance', account: '40700', action: 'threshold', value: '25%', reason: 'Insurance is billed annually', expires: FUTURE }]);
  const res = applyExceptions(run(), rules, '2026-09-05');
  t('a 20% variance falls below a 25% threshold and drops out',
    res.records[3].incomeStatement.map(s => s.slice(0, 29)), ['Expense variance: Landscaping']);
  t('the item that still clears the threshold is untouched',
    res.records[3].incomeStatement.length, 1);
  t('the dropped item is recorded as below threshold', res.applied[0].outcome, 'below threshold');
}
{
  const rules = parse([{ community: 'Ashgrove', check: 'expenseVariance', account: '40700', action: 'threshold', value: '$1000', reason: 'small swings are noise', expires: FUTURE }]);
  const res = applyExceptions(run(), rules, '2026-09-05');
  // $700 over budget is under the $1,000 floor; $1,750 is over it.
  t('a dollar threshold judges the dollar gap, not the percentage',
    res.records[3].incomeStatement.length, 1);
}
{
  const withNoReserve = [community('Hollowbrook Community Association, Inc.', { balanceSheet: { operating: { totalAssets: 10, totalLiabilitiesAndEquity: 10 }, reserve: null } })];
  const rules = parse([{ community: 'Hollowbrook', check: 'bsReserve', action: 'downgrade', reason: 'No reserve account is maintained', expires: FUTURE }]);
  const res = applyExceptions(withNoReserve, rules, '2026-09-05');
  const f = res.records[0].findings.find(x => x.check === 'bsReserve');
  t('a downgrade keeps the finding in the report', res.records[0].bsReserve, 'Not provided');
  t('but lowers what it argues for', [f.severity, f.downgradedFrom], ['warning', 'critical']);
  t('and carries the reason with it', f.exception.reason, 'No reserve account is maintained');
  t('the downgrade is recorded', res.applied[0].outcome, 'critical → warning');
}
{
  const rules = parse([{ community: 'Hollowbrook', check: 'bsReserve', action: 'downgrade', value: 'info', reason: 'No reserve account', expires: FUTURE }]);
  const res = applyExceptions([community('Hollowbrook Community Association, Inc.', { balanceSheet: { operating: { totalAssets: 10, totalLiabilitiesAndEquity: 10 }, reserve: null } })], rules, '2026-09-05');
  t('a downgrade can name its target severity',
    res.records[0].findings.find(x => x.check === 'bsReserve').severity, 'info');
}

// ------------------------------------------------------------------- hygiene
section('Rules that should not be trusted silently');
{
  const rules = parse([{ community: 'Marlowe Woods', check: 'sectionA', account: '30450', action: 'suppress', reason: 'contract', expires: '2026-01-31' }]);
  const res = applyExceptions(run(), rules, '2026-09-05');
  t('an expired rule does not apply', res.records[2].incomeStatement.length, 1);
  t('and says so', res.problems[0].kind, 'expired');
}
{
  const rules = parse([{ community: 'Marlowe Woods', check: 'sectionA', account: '99999', action: 'suppress', reason: 'contract', expires: FUTURE }]);
  const res = applyExceptions(run(), rules, '2026-09-05');
  t('a rule that matches nothing is reported', res.problems.map(p => p.kind), ['unused']);
}
{
  const rules = parse([{ community: 'Nowhere HOA', check: 'sectionA', action: 'suppress', reason: 'contract', expires: FUTURE }]);
  const res = applyExceptions(run(), rules, '2026-09-05');
  t('a rule naming a community not in the run is reported', res.problems[0].kind, 'unmatched');
}
{
  const before = run();
  const after = applyExceptions(before, [], '2026-09-05');
  t('no rules means the run is returned exactly as it was',
    JSON.stringify(after.records), JSON.stringify(before));
  t('and nothing is reported', [after.applied.length, after.problems.length], [0, 0]);
}
{
  // A global rule is the reason account numbers are normalised: one row should
  // cover every community, and the exceptions sheet still lists each hit.
  const rules = parse([{ check: 'sectionA', account: '30700', action: 'suppress', reason: 'remotes are billed by the vendor everywhere', expires: FUTURE }]);
  const res = applyExceptions(run(), rules, '2026-09-05');
  t('one global rule covers every community it matches', res.applied.length, 2);
  t('and each hit is listed separately',
    res.applied.map(a => a.community.slice(0, 9)), ['Southaven', 'Country C']);
}

// --------------------------------------------------------------- spreadsheet
// The rules live in a spreadsheet that people edit, so the headings are
// whatever someone typed and the reader has to be forgiving about them.
section('Reading the rule spreadsheet');
{
  const csv = [
    'Association,Finding,GL Account,Action,Threshold,Why,Review Date',
    'Marlowe Woods,Section A,30450,suppress,,"Leasing income is contractual, per the management agreement",2027-06-30',
    'Ashgrove Commons,expenseVariance,40700,threshold,25%,Insurance is billed annually,2027-06-30'
  ].join('\n');
  const rows = parseExceptionCSV(csv);
  t('alternative headings are understood', rows.length, 2);
  t('columns land in the right fields',
    [rows[0].community, rows[0].check, rows[0].account, rows[0].action, rows[0].expires],
    ['Marlowe Woods', 'Section A', '30450', 'suppress', '2027-06-30']);
  t('a quoted comma inside a reason survives',
    rows[0].reason, 'Leasing income is contractual, per the management agreement');
  t('a threshold value is carried through', rows[1].value, '25%');
  t('rows arrive enabled', rows.every(r => r.enabled === true), true);
  t('and every row parses into a rule',
    rows.map((r, i) => !!parseExceptionRule(r, i).rule), [true, true]);
}
{
  t('a file with no recognisable headings is refused',
    parseExceptionCSV('one,two,three\na,b,c'), []);
  t('an empty file is refused', parseExceptionCSV(''), []);
  t('a header row on its own yields no rules',
    parseExceptionCSV('community,check,account,action,value,reason,expires'), []);
}
{
  // Excel hands back a Date object where a CSV hands back text; a rule has to
  // read the same either way.
  t('an Excel date becomes a plain date', cellText(new Date(Date.UTC(2027, 5, 30))), '2027-06-30');
  t('rich text is flattened', cellText({ text: 'Section A' }), 'Section A');
  t('a blank cell is empty, not "null"', cellText(null), '');
  t('surrounding space is trimmed', cellText('  30700  '), '30700');
}
{
  const map = headerMap(['Community', 'Check', 'GL', 'Action', 'Value', 'Notes', 'Expiry']);
  t('headings map to fields regardless of wording',
    [map.community, map.check, map.account, map.action, map.value, map.reason, map.expires],
    [0, 1, 2, 3, 4, 5, 6]);
  t('an unknown heading is ignored rather than guessed',
    headerMap(['Community', 'Something Else']).account, undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
