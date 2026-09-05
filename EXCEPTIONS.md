# Writing exception rules

An exception tells the review to set aside something it would otherwise report,
for a stated reason. Use one when a finding is correct but expected — a contract
that always produces leasing income, an insurance premium billed once a year, a
community with no reserve account.

Two things an exception is **not**:

- It does not change the analysis. The statements are read exactly as before and
  the finding is still made. The exception decides what happens to it afterwards,
  which is why editing a rule and re-applying it costs nothing and takes a second.
- It does not hide anything. Everything an exception touches is listed on the
  **Exceptions Applied** sheet of the report, with the reason and the expiry date.
  A report always says what it is not showing you.

Rules live in a spreadsheet. Load it with **Exceptions → Import spreadsheet**, or
type rules straight into the panel and use **Export spreadsheet** to write the
file back out.

---

## The seven columns

| Column | Required | What it means |
|---|---|---|
| **Community** | no | Which community. Leave blank to apply to every community. |
| **Check** | no | Which kind of finding. Leave blank for any. |
| **Account** | no | Which GL account. Leave blank for any. |
| **Action** | yes | `suppress`, `downgrade`, or `threshold`. |
| **Value** | only for `downgrade` / `threshold` | The threshold, or the severity to drop to. |
| **Reason** | **yes** | Why. This is printed in the report. |
| **Expires** | **yes** | When the rule stops applying, as `YYYY-MM-DD`. |

Headings are read loosely, so a file that says `Association`, `Finding`,
`GL Account`, `Why` and `Review Date` works just as well.

### Reason and Expires are required, on purpose

A rule with no reason cannot be reviewed by anyone else — including you in a
year's time. A rule with no expiry never gets looked at again, and an exceptions
file that only grows is how a real problem eventually hides in plain sight.

Pick an expiry that means something: the end of the contract that justifies the
rule, or the next budget year. When a rule expires it stops applying and appears
on the report under **Rules that did not apply**, so it asks to be renewed rather
than failing silently.

---

## Check

Write these however you like — `Section A`, `section a` and `sectionA` are all
read the same way.

| Check | What it catches | Where it shows |
|---|---|---|
| `sectionA` | The four special income accounts | Accounting report |
| `expenseVariance` | Expense over or under budget past the threshold | Manager report |
| `incomeVariance` | Income over or under budget past the threshold | Manager report |
| `negativeExpense` | An expense with a negative actual | Manager report |
| `negativeIncome` | Income with a negative actual | Manager report |
| `bsReserve` | Reserve column out of balance, or absent | Accounting report |
| `bsOperating` | Operating column out of balance, or absent | Accounting report |
| `lowCash` | Cash low against the annual budget | Accounting report |
| `prepaid` | Balance sheet prepaid not matching the homeowner list | Accounting report |
| `ledgerAdjustment` | Negative non-PrePaid balance on the aging report | Accounting report |

`sectionA` also accepts `special income`. `ledgerAdjustment` also accepts
`aging`. `bsReserve` accepts `reserve`, `lowCash` accepts `cash`.

---

## Action

### `suppress` — take it out of the report

The finding is removed from the community's row and listed on the Exceptions
Applied sheet instead, struck through, with your reason beside it. Use this when
the item is genuinely expected every month.

### `downgrade` — leave it visible, stop it driving the status

The finding stays in the cell exactly as before, but no longer counts against the
community's status. Put the target severity in **Value** — `warning` or `info` —
or leave Value blank to move it down one step (critical becomes warning).

Use this when a reader should still see the item but it should not colour the
community red. A community with no reserve account is the clearest case: the cell
should still say "Not provided", but that is a fact about the community, not a
problem to chase every month.

### `threshold` — judge the item differently

Only applies to `expenseVariance` and `incomeVariance`. Put the new threshold in
**Value**:

- `25%` or plain `25` — report the variance only if it exceeds 25% (default is 10%)
- `$2,500` — report it only if the dollar gap is at least $2,500

Items that no longer clear the threshold drop out and appear on the Exceptions
Applied sheet as *below threshold*. Items that still clear it are reported as
normal. This is usually better than suppressing an account outright: a small
monthly wobble stops being noise, but a genuinely large swing still surfaces.

---

## Naming a community

Write as much of the name as you need. Matching ignores case, punctuation and
the "Homeowners Association, Inc." tail, so **Marlowe Woods** finds *Marlowe
Woods Homeowners Association, Inc*.

**A short name that fits two communities is refused, not guessed.** The roster
contains ten of these — phase one and phase two of the same subdivision, a
community and its park, two neighbourhoods off the same street name. If you write
one, the report tells you which communities it matched and asks for more of the
name. Add the distinguishing word:

| Instead of | Write |
|---|---|
| `Ashwood` (matches Ashwood and Ashwood Park) | `Ashwood Homeowners` or `Ashwood Park` |
| `Kingsmere` (matches One and Two) | `Kingsmere Homeowners Association Two` |

A name is only matched from the **start**, never from the middle. A rule for
`Riverbend Country Club` will never touch `Country Club of the Meadows`.

---

## Examples

**One community, one account.** Pool and gate remote income is billed by the
vendor under contract, so it appears every month and is not a finding.

| Community | Check | Account | Action | Value | Reason | Expires |
|---|---|---|---|---|---|---|
| Riverbend Country Club | Section A | 30700 | suppress | | Pool contract — remotes billed by the vendor | 2027-06-30 |

**The same rule for a second community.** Write it as its own row. Two rows that
say the same thing are easier to read, and easier to remove one of, than one
clever row.

| Community | Check | Account | Action | Value | Reason | Expires |
|---|---|---|---|---|---|---|
| Marlowe Woods | Section A | 30450 | suppress | | Leasing income is contractual and expected | 2027-06-30 |

**Every community, one account.** Leave Community blank. One row covers the whole
run, and each community it touches is still listed separately on the report.

| Community | Check | Account | Action | Value | Reason | Expires |
|---|---|---|---|---|---|---|
| | expenseVariance | 40700 | threshold | 25% | Insurance is billed annually; monthly variance is expected | 2027-01-31 |

**Keep it visible, stop it counting.** The cell still reads "Not provided"; the
community stops showing as critical.

| Community | Check | Account | Action | Value | Reason | Expires |
|---|---|---|---|---|---|---|
| Hollowbrook | bsReserve | | downgrade | warning | No reserve account is maintained | 2027-12-31 |

**A dollar floor instead of a percentage.** Small swings on a small budget line
stop being reported; a large one still is.

| Community | Check | Account | Action | Value | Reason | Expires |
|---|---|---|---|---|---|---|
| | expenseVariance | 60400 | threshold | $2,500 | Landscaping is seasonal; only large swings are worth review | 2027-01-31 |

---

## Checking that a rule worked

After a run, the results header counts **Exceptions Applied** and **Rules Idle**.
Open the **Exceptions Applied** sheet in either report:

- the top block lists everything that was set aside, and why
- the block below lists rules that did nothing, and the reason — expired, matched
  nothing this month, or naming a community that was not in the run

A rule that matched nothing is not necessarily wrong; the account may simply have
been within budget that month. A rule that names a community not in the run
usually means the name is misspelled or the community has been renamed in CINC.

The Exceptions panel shows the same notes against each rule, and marks in red any
row it could not read at all.

---

## A few habits worth keeping

- **One rule, one reason.** Resist a rule so broad you cannot say in one sentence
  what it is for.
- **Prefer `threshold` to `suppress`** on variance accounts. Suppressing an
  account means never hearing about it again, including the month it matters.
- **Write the reason for someone else.** "Contract" is not a reason; "Pool
  contract — remotes billed by the vendor" is.
- **Re-read the expired list once a year.** That is what the expiry dates are for.
