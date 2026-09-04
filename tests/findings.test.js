// Unit tests for the findings engine in hoa-financial-review.html.
//
//   node tests/findings.test.js
//
// No API key, no network, no client data - every case below is synthetic.
// The engine is the part that decides what gets reported, so this is where a
// rule change shows up. Each case tagged [regression] reproduces a bug that
// actually reached a monthly report; keep them.

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'hoa-financial-review.html');
const src = fs.readFileSync(APP, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const engine = src.slice(src.indexOf('// ===== FINDINGS ENGINE ====='), src.indexOf('// ===== EXTRACTION ====='));
eval(engine);

let pass = 0, fail = 0;
function t(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  pass  ' + name); }
  else {
    fail++;
    console.log('  FAIL  ' + name);
    console.log('          got:  ' + JSON.stringify(got));
    console.log('          want: ' + JSON.stringify(want));
  }
}
const section = n => console.log('\n' + n);

// ---------------------------------------------------------------- balance sheet
section('Balance sheet');
t('balanced column', checkBalanceColumn({ totalAssets: 149328.63, totalLiabilitiesAndEquity: 149328.63 }), 'OK');
t('sub-cent difference is balanced', checkBalanceColumn({ totalAssets: 100.004, totalLiabilitiesAndEquity: 100.0 }), 'OK');
t('absent column is not an imbalance', checkBalanceColumn(undefined), 'Not provided');
t('null figures are not an imbalance', checkBalanceColumn({ totalAssets: null, totalLiabilitiesAndEquity: null }), 'Not provided');
t('[regression] Jamestown operating imbalance',
  checkBalanceColumn({ totalAssets: 320040.63, totalLiabilitiesAndEquity: 292240.63 }),
  'Out of balance — Total Assets: $320,040.63; Total Liabilities & Equity: $292,240.63; Difference: $27,800.00');
t('[regression] Highland Gates reserve imbalance',
  checkBalanceColumn({ totalAssets: 62232.44, totalLiabilitiesAndEquity: 81602.48 }),
  'Out of balance — Total Assets: $62,232.44; Total Liabilities & Equity: $81,602.48; Difference: $-19,370.04');

// A balanced Total column must never mask per-column imbalances that cancel out.
// This is the v41 bug: Operating +27,800 and Reserve -27,800 sum to zero.
section('Balance sheet - offsetting imbalances [regression]');
{
  const r = buildFindings({
    balanceSheet: {
      operating: { totalAssets: 320040.63, totalLiabilitiesAndEquity: 292240.63 },
      reserve: { totalAssets: 951549.16, totalLiabilitiesAndEquity: 979349.16 },
      cashOperating: null
    },
    annualIncomeBudget: null
  });
  t('operating flagged', r.bsOperating.startsWith('Out of balance'), true);
  t('reserve flagged', r.bsReserve.startsWith('Out of balance'), true);
}

// ---------------------------------------------------------------------- prepaid
section('Pre-paid reconciliation');
t('matching figures', checkPrepaid({ balanceSheetAmount: 1175, homeownerListTotal: 1175 }), 'OK');
t('no prepaid data at all', checkPrepaid({ balanceSheetAmount: null, homeownerListTotal: null }), 'Not provided');
t('nothing on either side reconciles', checkPrepaid({ balanceSheetAmount: null, homeownerListTotal: 0 }), 'OK');
t('[regression] Trinity Falls mismatch',
  checkPrepaid({ balanceSheetAmount: 8006.90, homeownerListTotal: 6773.70 }),
  'Mismatch — Balance Sheet: $8,006.90; PrePaid Homeowner List Total: $6,773.70; Difference: $1,233.20');
t('[regression] list balance with no balance-sheet line is a mismatch, not "Not provided"',
  checkPrepaid({ balanceSheetAmount: null, homeownerListTotal: 568.22 }),
  'Mismatch — Balance Sheet: $0.00; PrePaid Homeowner List Total: $568.22; Difference: $-568.22');

// -------------------------------------------------------------------- section A
section('Section A - special income accounts');
const sa = x => buildIncomeStatementFindings({ specialIncome: x });
t('collection fee, negative', sa([{ accountNumber: '30800-00', currentPeriodActual: -480, ytdActual: -480 }]),
  ['**Collection Fee Income: 30800-00 ($-480.00)**']);
t('thousands separator', sa([{ accountNumber: '30700-00', currentPeriodActual: 2525, ytdActual: 15830 }]),
  ['**Pool & Gate Remotes: 30700-00 ($2,525.00)**']);
t('NSF label', sa([{ accountNumber: '30850-00', currentPeriodActual: 25, ytdActual: 25 }]),
  ['**NSF Charges: 30850-00 ($25.00)**']);
t('leasing fee label', sa([{ accountNumber: '30450-00', currentPeriodActual: 4768.25, ytdActual: 4768.25 }]),
  ['**Leasing Fee Income: 30450-00 ($4,768.25)**']);
t('[regression] account not on the Section A list is dropped',
  sa([{ accountNumber: '30100-00', currentPeriodActual: 99, ytdActual: 99 }]), ['OK']);
t('[regression] a dash this period is not reported as $0.00',
  sa([{ accountNumber: '30850-00', currentPeriodActual: 0, ytdActual: 0 }]), ['OK']);
t('[regression] prior-period balance still in YTD is labelled, not shown as this month',
  sa([{ accountNumber: '30700-00', currentPeriodActual: 0, ytdActual: -200 }]),
  ['**Pool & Gate Remotes: 30700-00 (YTD $-200.00, no current-period activity)**']);
t('section A account is not also reported in section B/B2', buildIncomeStatementFindings({
  specialIncome: [{ accountNumber: '30700-00', currentPeriodActual: -25, ytdActual: -25 }],
  incomeAccounts: [{ accountNumber: '30700-00', accountName: 'Pool & Gate Devices', currentPeriodActual: -25, currentPeriodBudget: 0 }]
}), ['**Pool & Gate Remotes: 30700-00 ($-25.00)**']);

// ------------------------------------------------------------- sections B/B2/C/D
section('Income and expense findings');
t('income variance format', buildIncomeStatementFindings({ incomeAccounts: [
  { accountNumber: '30000-00', accountName: 'Regular Association Fee', currentPeriodActual: 45829.88, currentPeriodBudget: 55500 }]}),
  ['Income variance: Regular Association Fee (30000-00) — Actual: $45,829.88, Budget: $55,500.00, Variance: 17.4%']);
t('expense variance format', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '70000-00', accountName: 'Clubhouse Cleaning', currentPeriodActual: 842.51, currentPeriodBudget: 400 }]}),
  ['Expense variance: Clubhouse Cleaning (70000-00) — Actual: $842.51, Budget: $400.00, Variance: 110.6%']);
t('variance at or under 10% is not reported', buildIncomeStatementFindings({ incomeAccounts: [
  { accountNumber: '30000-00', accountName: 'X', currentPeriodActual: 1000, currentPeriodBudget: 1050 }]}), ['OK']);
t('variance over 10% but under $50 is not reported', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40000-00', accountName: 'X', currentPeriodActual: 100, currentPeriodBudget: 60 }]}), ['OK']);

// Pin both thresholds from just inside and just outside, so moving either one
// fails here rather than only showing up in the golden-master diff.
t('threshold: 9.9% is not reported', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40000-00', accountName: 'X', currentPeriodActual: 1099, currentPeriodBudget: 1000 }]}), ['OK']);
t('threshold: 12% is reported', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40000-00', accountName: 'X', currentPeriodActual: 1120, currentPeriodBudget: 1000 }]}),
  ['Expense variance: X (40000-00) — Actual: $1,120.00, Budget: $1,000.00, Variance: 12.0%']);
t('threshold: $49 gap is not reported', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40000-00', accountName: 'X', currentPeriodActual: 149, currentPeriodBudget: 100 }]}), ['OK']);
t('threshold: $51 gap is reported', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40000-00', accountName: 'X', currentPeriodActual: 151, currentPeriodBudget: 100 }]}),
  ['Expense variance: X (40000-00) — Actual: $151.00, Budget: $100.00, Variance: 51.0%']);
t('threshold: negative expense of exactly $50 is reported', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40100-00', accountName: 'X', currentPeriodActual: -50, currentPeriodBudget: 0 }]}),
  ['Negative expense: X (40100-00) ($50.00)']);
t('[regression] zero budget is skipped, never "infinite variance"', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40000-00', accountName: 'X', currentPeriodActual: 500, currentPeriodBudget: 0 }]}), ['OK']);
t('negative income is reported at any size', buildIncomeStatementFindings({ incomeAccounts: [
  { accountNumber: '30100-00', accountName: 'Fine Reimbursement', currentPeriodActual: -300, currentPeriodBudget: 0 }]}),
  ['Negative income: Fine Reimbursement (30100-00) ($300.00)']);
t('negative expense format', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40100-00', accountName: 'Electricity - Clubhouse/Rec Area', currentPeriodActual: -1838.07, currentPeriodBudget: 0 }]}),
  ['Negative expense: Electricity - Clubhouse/Rec Area (40100-00) ($1,838.07)']);
t('negative expense under $50 is not reported', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40100-00', accountName: 'X', currentPeriodActual: -25, currentPeriodBudget: 0 }]}), ['OK']);

// The single most persistent bug in this app's history: an over-budget expense
// has a NEGATIVE variance but a POSITIVE actual, and was repeatedly reported as
// a negative expense. Only the actual column may decide Section C.
section('Over-budget expense is not a negative expense [regression]');
t('reported as a variance, not a negative expense', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40100-00', accountName: 'Electricity - Clubhouse/Rec Area', currentPeriodActual: 442.57, currentPeriodBudget: 360 }]}),
  ['Expense variance: Electricity - Clubhouse/Rec Area (40100-00) — Actual: $442.57, Budget: $360.00, Variance: 22.9%']);
t('negative actual routes to Section C, not Section D', buildIncomeStatementFindings({ expenseAccounts: [
  { accountNumber: '40600-00', accountName: 'Insurance', currentPeriodActual: -64, currentPeriodBudget: 1141.03 }]}),
  ['Negative expense: Insurance (40600-00) ($64.00)']);

// ---------------------------------------------------------------------- low cash
section('Low cash');
const lc = (cash, budget) => buildFindings({
  balanceSheet: { operating: { totalAssets: 1, totalLiabilitiesAndEquity: 1 }, cashOperating: cash },
  annualIncomeBudget: budget
}).bsOperating;
t('under 20% is Low Cash', lc(19000, 100000), 'Low Cash ($19,000.00 balance, $100,000.00 annual budget)');
t('under 10% is Very Low Cash', lc(9000, 100000), 'Very Low Cash ($9,000.00 balance, $100,000.00 annual budget)');
t('healthy balance is OK', lc(50000, 100000), 'OK');
t('[regression] no budget means no cash flag at all', lc(50, null), 'OK');
t('[regression] negative total cash is Very Low Cash',
  lc(-2313.98, 31450), 'Very Low Cash ($-2,313.98 balance, $31,450.00 annual budget)');
t('cash flag is appended to an imbalance, not replacing it', buildFindings({
  balanceSheet: { operating: { totalAssets: 100, totalLiabilitiesAndEquity: 50 }, cashOperating: 5 },
  annualIncomeBudget: 100
}).bsOperating,
  'Out of balance — Total Assets: $100.00; Total Liabilities & Equity: $50.00; Difference: $50.00 | Very Low Cash ($5.00 balance, $100.00 annual budget)');

// --------------------------------------------------------------------- assembly
section('Whole-record assembly');
{
  const r = buildFindings({
    communityName: 'Test HOA',
    balanceSheet: { operating: { totalAssets: 10, totalLiabilitiesAndEquity: 10 }, reserve: null, cashOperating: null },
    prepaid: { balanceSheetAmount: null, homeownerListTotal: null },
    annualIncomeBudget: null,
    specialIncome: [], incomeAccounts: [], expenseAccounts: []
  });
  t('clean record', [r.communityName, r.bsOperating, r.bsReserve, r.prepaid, r.incomeStatement],
    ['Test HOA', 'OK', 'Not provided', 'Not provided', ['OK']]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
