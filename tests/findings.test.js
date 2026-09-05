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
const engine = src.slice(src.indexOf('// ===== FINDINGS ENGINE ====='), src.indexOf('// ===== EXCEPTIONS ====='));
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

// ------------------------------------------------------- ledger adjustments
// Negative balances on any assessment type other than PrePaid come from
// incorrect ledger adjustments. Warning tier, never critical.
section('Ledger adjustments (homeowner aging)');
t('no aging report in the package', checkLedgerAdjustments({ agingReportPresent: false, agingNegatives: [] }), 'Not provided');
t('aging report present and clean', checkLedgerAdjustments({ agingReportPresent: true, agingNegatives: [] }), 'OK');
t('PrePaid credits are normal and never reported', checkLedgerAdjustments({ agingReportPresent: true, agingNegatives: [
  { accountCode: 'CCS001', ownerName: 'A Homeowner', lineItem: 'PrePaid', balance: -2100 }]}), 'OK');
t('hyphenated Pre-Paid spelling also excluded', checkLedgerAdjustments({ agingReportPresent: true, agingNegatives: [
  { accountCode: 'CCS001', ownerName: 'A Homeowner', lineItem: 'Pre-Paid Assessments', balance: -500 }]}), 'OK');
t('positive balances are not adjustments', checkLedgerAdjustments({ agingReportPresent: true, agingNegatives: [
  { accountCode: 'CCS001', ownerName: 'A', lineItem: 'Late Fee 2026', balance: 150 }]}), 'OK');
t('negative late fee is reported', checkLedgerAdjustments({ agingReportPresent: true, agingNegatives: [
  { accountCode: 'CCS019', ownerName: 'Grantley Joseph & Carla Joseph', lineItem: 'Late Fee (Delinquent Fee)2026', balance: -150 }]}),
  ['CCS019 Grantley Joseph & Carla Joseph — Late Fee (Delinquent Fee)2026: ($150.00)']);
t('several rows on one account are listed separately', checkLedgerAdjustments({ agingReportPresent: true, agingNegatives: [
  { accountCode: 'CCS550', ownerName: 'Imad Sabbagh', lineItem: 'Interest (Delinquent Interest)2026', balance: -6.42 },
  { accountCode: 'CCS550', ownerName: 'Imad Sabbagh', lineItem: 'Late Fee (Delinquent Fee)2026', balance: -737.75 }]}),
  ['CCS550 Imad Sabbagh — Interest (Delinquent Interest)2026: ($6.42)',
   'CCS550 Imad Sabbagh — Late Fee (Delinquent Fee)2026: ($737.75)']);
t('[regression] an account netting to zero is still flagged on the negative row',
  checkLedgerAdjustments({ agingReportPresent: true, agingNegatives: [
    { accountCode: 'CCS276', ownerName: 'Edmond Chao', lineItem: 'Late Fee (Delinquent Fee)2026', balance: -150 }]}),
  ['CCS276 Edmond Chao — Late Fee (Delinquent Fee)2026: ($150.00)']);

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
  t('clean record', [r.communityName, r.bsOperating, r.bsReserve, r.prepaid, r.ledgerAdjustments, r.incomeStatement],
    ['Test HOA', 'OK', 'Not provided', 'Not provided', 'Not provided', ['OK']]);
}

// ------------------------------------------------------------------ findings
// The exception rules will match on the finding record, not on the sentence, so
// the record has to carry a stable identity and the sentence has to stay exactly
// reproducible from it. Both halves are asserted here; golden-check.js asserts
// the same identity across a full real month.
section('Finding records');
{
  const r = buildFindings({
    communityName: 'Test HOA',
    balanceSheet: { operating: { totalAssets: 100, totalLiabilitiesAndEquity: 100 }, reserve: null, cashOperating: 15 },
    annualIncomeBudget: 100,
    prepaid: { balanceSheetAmount: 500, homeownerListTotal: 400 },
    agingReportPresent: true,
    agingNegatives: [{ accountCode: 'A100', ownerName: 'Sample Owner', lineItem: 'Assessments', balance: -25 }],
    specialIncome: [{ accountNumber: '30850-000', currentPeriodActual: -480, ytdActual: -480 }],
    incomeAccounts: [{ accountNumber: '40100', accountName: 'Assessment Income', currentPeriodActual: 900, currentPeriodBudget: 1200 }],
    expenseAccounts: [{ accountNumber: '60400-100', accountName: 'Landscaping', currentPeriodActual: 4200, currentPeriodBudget: 3500 }]
  });

  t('every finding carries check, column, severity and text',
    r.findings.every(f => f.check && f.column && f.severity && typeof f.text === 'string'), true);

  const byCheck = c => r.findings.filter(f => f.check === c);
  t('one finding per reported item, in report order',
    r.findings.map(f => f.check),
    ['lowCash', 'bsReserve', 'prepaid', 'ledgerAdjustment', 'sectionA', 'incomeVariance', 'expenseVariance']);

  // Identity: rebuild each cell from its own findings and compare.
  const inCol = c => r.findings.filter(f => f.column === c);
  t('bsOperating rebuilds from its findings', renderFindingCell(inCol('bsOperating')), r.bsOperating);
  t('bsReserve rebuilds from its findings', renderFindingCell(inCol('bsReserve')), r.bsReserve);
  t('prepaid rebuilds from its findings', renderFindingCell(inCol('prepaid')), r.prepaid);
  t('ledger rebuilds from its findings', renderLedgerField(inCol('ledgerAdjustments')), r.ledgerAdjustments);
  t('income statement rebuilds from its findings', inCol('incomeStatement').map(f => f.text), r.incomeStatement);

  // A rule is written against the account number as the chart of accounts lists
  // it, so a "-100" cost-centre suffix must not stop the rule from matching.
  t('account suffix is normalised away for matching', byCheck('expenseVariance')[0].account, '60400');
  t('the full account number is kept alongside it', byCheck('expenseVariance')[0].accountNumber, '60400-100');
  t('section A account is normalised too', byCheck('sectionA')[0].account, '30850');
  t('account name is carried for the exceptions sheet', byCheck('expenseVariance')[0].accountName, 'Landscaping');

  t('variance figures are kept so a threshold rule can re-judge the item',
    [byCheck('expenseVariance')[0].figures.actual, byCheck('expenseVariance')[0].figures.budget,
     Number(byCheck('expenseVariance')[0].figures.pct.toFixed(1))], [4200, 3500, 20]);

  // The homeowner account code is not a GL account; keeping it out of `account`
  // stops a rule for GL 40700 from ever matching a homeowner ledger row.
  t('homeowner code is not stored as a GL account', byCheck('ledgerAdjustment')[0].account, null);
  t('homeowner code is kept in ref', byCheck('ledgerAdjustment')[0].ref.accountCode, 'A100');
}

section('Finding severity and absent data');
{
  const r = buildFindings({
    balanceSheet: { operating: { totalAssets: 10, totalLiabilitiesAndEquity: 10 }, reserve: null, cashOperating: null },
    prepaid: null, annualIncomeBudget: null
  });
  const one = c => r.findings.find(f => f.check === c);
  // "Not provided" is a finding, not a silence - it is what the 11 communities
  // with no reserve account will have an exception written against.
  t('a missing reserve column is a finding, not nothing', !!one('bsReserve'), true);
  t('and it is marked as absent data', one('bsReserve').notProvided, true);
  t('a missing prepaid reconciliation is a finding', one('prepaid').notProvided, true);
  t('an unexamined aging report never counts against the community',
    one('ledgerAdjustment').severity, 'info');
  t('a balanced column produces no finding at all',
    r.findings.filter(f => f.column === 'bsOperating').length, 0);
}
{
  const cash = (c, b) => buildFindings({ balanceSheet: { operating: { totalAssets: 1, totalLiabilitiesAndEquity: 1 }, cashOperating: c }, annualIncomeBudget: b })
    .findings.find(f => f.check === 'lowCash');
  t('low cash argues for a warning', cash(15, 100).severity, 'warning');
  t('very low cash argues for a critical', cash(5, 100).severity, 'critical');
  t('healthy cash produces no finding', cash(50, 100), undefined);
}

// ---------------------------------------------------------------- status tiers
// Status is graded from the findings' severities. It used to be read back out of
// the rendered cell, which could not distinguish a cash flag that was the whole
// story from one sitting beside an imbalance.
section('Community status');
const rec = over => buildFindings(Object.assign({
  prepaid: { balanceSheetAmount: 1, homeownerListTotal: 1 },
  agingReportPresent: true, agingNegatives: []
}, over, {
  balanceSheet: Object.assign({
    operating: { totalAssets: 10, totalLiabilitiesAndEquity: 10 },
    reserve: { totalAssets: 5, totalLiabilitiesAndEquity: 5 }
  }, over.balanceSheet)
}));

t('a clean community is OK', communityStatus(rec({}), 'screen'), 'OK');
t('an out-of-balance operating column is critical',
  communityStatus(rec({ balanceSheet: { operating: { totalAssets: 100, totalLiabilitiesAndEquity: 60 } } }), 'screen'), 'CRITICAL');
t('a missing reserve column is critical',
  communityStatus(rec({ balanceSheet: { reserve: null } }), 'screen'), 'CRITICAL');
t('low cash on its own is a warning',
  communityStatus(rec({ balanceSheet: { cashOperating: 15 }, annualIncomeBudget: 100 }), 'screen'), 'WARNING');
t('very low cash on its own is critical',
  communityStatus(rec({ balanceSheet: { cashOperating: 5 }, annualIncomeBudget: 100 }), 'screen'), 'CRITICAL');

// [regression] The cell reads "Out of balance … | Low Cash (…)". Grading that
// sentence with /Low Cash/ said "warning", hiding an imbalance behind a cash
// flag. It never fired on a real month, but it was one statement away.
t('[regression] a low cash flag does not mask an imbalance',
  communityStatus(rec({ balanceSheet: { operating: { totalAssets: 100, totalLiabilitiesAndEquity: 60 }, cashOperating: 15 }, annualIncomeBudget: 100 }), 'screen'),
  'CRITICAL');
t('[regression] nor does it mask a missing operating column',
  communityStatus(rec({ balanceSheet: { operating: null, cashOperating: 15 }, annualIncomeBudget: 100 }), 'screen'),
  'CRITICAL');

t('an unexamined aging report is not a warning',
  communityStatus(rec({ agingReportPresent: false }), 'screen'), 'OK');
t('a negative non-PrePaid balance is a warning',
  communityStatus(rec({ agingNegatives: [{ accountCode: 'A1', ownerName: 'Someone', lineItem: 'Assessments', balance: -25 }] }), 'screen'), 'WARNING');

// The three surfaces grade different slices of the income statement.
{
  const r = rec({
    specialIncome: [{ accountNumber: '30700-00', currentPeriodActual: 1475 }],
    expenseAccounts: [{ accountNumber: '40700', accountName: 'Insurance', currentPeriodActual: 4200, currentPeriodBudget: 3500 }]
  });
  t('the screen grades on every income item', communityStatus(r, 'screen'), 'WARNING');
  t('the accounting sheet grades on Section A', communityStatus(r, 'accounting'), 'WARNING');
  t('a manager tab grades on the items it shows', communityStatus(r, 'manager'), 'WARNING');
}
{
  const onlySectionA = rec({ specialIncome: [{ accountNumber: '30700-00', currentPeriodActual: 1475 }] });
  t('a Section A item alone does not warn a manager tab', communityStatus(onlySectionA, 'manager'), 'OK');
  t('but it does warn the accounting sheet', communityStatus(onlySectionA, 'accounting'), 'WARNING');
}
{
  const onlyExpense = rec({ expenseAccounts: [{ accountNumber: '40700', accountName: 'Insurance', currentPeriodActual: 4200, currentPeriodBudget: 3500 }] });
  t('an expense variance alone does not warn the accounting sheet', communityStatus(onlyExpense, 'accounting'), 'OK');
  t('but it does warn the manager tab', communityStatus(onlyExpense, 'manager'), 'WARNING');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
