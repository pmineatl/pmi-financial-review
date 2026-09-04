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
