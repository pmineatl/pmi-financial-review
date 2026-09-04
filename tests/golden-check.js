// Golden-master regression check against a real month.
//
//   node tests/golden-check.js            compare current engine to the snapshot
//   node tests/golden-check.js --update   accept current output as the new snapshot
//
// Costs nothing and needs no API key: the model's extractions for a validated
// month are cached in tests/golden/extractions.json, and this re-runs only the
// findings engine over them. That catches any change in what gets reported,
// across 110 real communities, in about a second.
//
// tests/golden/ is gitignored - it contains real community financial data and
// this repository is public. See tests/README.md to rebuild it.

const fs = require('fs');
const path = require('path');

const GOLDEN = path.join(__dirname, 'golden');
const EXTRACTIONS = path.join(GOLDEN, 'extractions.json');
const SNAPSHOT = path.join(GOLDEN, 'expected.json');

if (!fs.existsSync(EXTRACTIONS)) {
  console.error('No fixtures found at tests/golden/extractions.json.');
  console.error('This check needs a locally cached month - see tests/README.md.');
  process.exit(2);
}

const APP = path.join(__dirname, '..', 'hoa-financial-review.html');
const src = fs.readFileSync(APP, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
eval(src.slice(src.indexOf('// ===== FINDINGS ENGINE ====='), src.indexOf('// ===== EXTRACTION =====')));

const extractions = JSON.parse(fs.readFileSync(EXTRACTIONS, 'utf8'));
const current = {};
for (const [community, extracted] of Object.entries(extractions)) {
  current[community] = buildFindings(extracted);
}

if (process.argv.includes('--update')) {
  fs.writeFileSync(SNAPSHOT, JSON.stringify(current, null, 1));
  console.log(`Snapshot updated: ${Object.keys(current).length} communities.`);
  process.exit(0);
}

if (!fs.existsSync(SNAPSHOT)) {
  console.error('No snapshot yet. Review the current output, then run with --update.');
  process.exit(2);
}

const expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const fields = ['bsOperating', 'bsReserve', 'prepaid'];
let changed = 0;

for (const community of Object.keys(expected)) {
  const was = expected[community], now = current[community];
  if (!now) { console.log(`MISSING  ${community}`); changed++; continue; }
  const diffs = [];
  for (const f of fields) {
    if (was[f] !== now[f]) diffs.push(`  ${f}\n      was: ${was[f]}\n      now: ${now[f]}`);
  }
  const wasSet = new Set(was.incomeStatement || []);
  const nowSet = new Set(now.incomeStatement || []);
  const added = [...nowSet].filter(i => !wasSet.has(i));
  const removed = [...wasSet].filter(i => !nowSet.has(i));
  for (const i of removed) diffs.push(`  - ${i}`);
  for (const i of added) diffs.push(`  + ${i}`);
  if (diffs.length) { changed++; console.log(`\n${community}`); diffs.forEach(d => console.log(d)); }
}
for (const community of Object.keys(current)) {
  if (!expected[community]) { console.log(`NEW      ${community}`); changed++; }
}

const total = Object.keys(expected).length;
console.log(`\n${total - changed}/${total} communities unchanged.`);
if (changed) {
  console.log(`${changed} changed. Confirm each change is intended, then re-run with --update.`);
  process.exit(1);
}
console.log('No regressions.');
