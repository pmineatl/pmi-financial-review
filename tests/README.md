# Tests

Two layers, both free to run and neither needing an API key.

## `node tests/findings.test.js`

Unit tests for the findings engine — the code that decides what appears in a
report. All data is synthetic, so this file is safe to commit and safe to read.

Cases tagged `[regression]` reproduce bugs that actually reached a monthly
report. The most persistent one: an over-budget expense has a *negative
variance* but a *positive actual*, and was repeatedly reported as a negative
expense. Don't delete those cases.

Run it after any change to thresholds, formats, or section rules.

## `node tests/exceptions.test.js`

Unit tests for the exception rules — parsing a rule, resolving the community it
names, and applying suppress / downgrade / threshold to a finished run. All data
is synthetic.

Community names are matched by **prefix, never by substring**, and an ambiguous
prefix is refused rather than guessed. That is not a theoretical concern: the
real roster contains ten short names that each fit two communities — phase one
and phase two of the same subdivision, a community and its park, two streets off
the same name. An exception applied to the wrong community is the worst thing
this feature could do, so the refusal path has its own cases and should keep them.

## `node tests/golden-check.js`

Golden-master check across a full validated month (110 communities), so a rule
change is measured against real statements rather than invented ones.

The model's extractions for that month are cached, so this re-runs only the
findings engine over them — about a second, no API calls, no cost. It reports
every community whose output would change.

```
node tests/golden-check.js            # compare against the snapshot
node tests/golden-check.js --update   # accept current output as the new snapshot
```

Only run `--update` once you have confirmed every reported change is intended.
The snapshot is the record of what "correct" looks like; updating it without
reading the diff defeats the point.

### The identity invariant

Alongside the snapshot comparison, this check asserts that every report cell is
exactly reproducible from the finding records it was rendered from, on all 110
communities. The findings engine builds structured records — `{ check, column,
severity, account, figures, text }` — and renders the cells from them; the
exception rules match on the record, never on the sentence.

If that invariant ever fails, the record and the wording have drifted apart, and
an exception would silence something other than the item it names. Treat a
failure here as a bug in the engine, not a snapshot to update.

### Fixtures are deliberately not committed

`tests/golden/` is gitignored. **This repository is public** — it is served as a
GitHub Pages site — and the fixtures contain real community financial data.
HOA packages also carry homeowner names, addresses and email addresses, so no
client data of any kind belongs in this repo.

To rebuild the fixtures on a machine that has them:

1. Pull a month's PDFs from CINC (single publish date — one document per
   community) and keep them outside the repository.
2. Run each through the extraction path and save the parsed JSON, keyed by
   community name, to `tests/golden/extractions.json`.
3. Verify that month's output is correct, then `node tests/golden-check.js --update`.

The snapshot currently in use was built from July 2026 (110 communities) and
verified two ways: every balance-sheet column was checked against an
independent calculation done directly from the PDF text rather than by the
model, and 3,991 of 3,992 line items were confirmed against the same source.
