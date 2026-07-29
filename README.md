# Transfer Reconciliation — Dynamics vs S4U

A small internal tool that checks whether a Dynamics transfer export and an
S4U back-office report agree on quantities, even though the two systems
almost never spell a product name the same way.

Everything runs client-side in the browser — there's no database and
nothing is uploaded anywhere except to the page itself. Refreshing the page
clears everything.

## What it does

1. Upload the Dynamics export on the left, the S4U back-office report on
   the right. `.xlsx`, `.xls`, and `.csv` are all accepted for both.
2. It reads **Item number / Transfer quantity / Product name** from the
   Dynamics file (summing duplicate item numbers — Dynamics sometimes
   splits one item across two rows).
3. It reads **Item description / UOM / N. Qty** from the S4U file, skipping
   vendor headers, subtotal rows, the grand total, and the report footer
   automatically.
4. It fuzzy-matches product names between the two (handles reordered
   words, punctuation differences, and missing spaces like "20LTR" vs
   "20 LTR") and compares Transfer quantity against N. Qty for every match.
5. High-confidence matches (≥82% name similarity) are trusted outright.
   Matches between 65–82% are still shown but flagged **Review**. Anything
   below that isn't guessed — it's left in the "needs a manual match"
   section with a dropdown of plausible candidates, so a person makes the
   final call instead of the tool quietly assuming.
6. Export the full result to Excel with one click.

## AI-assisted matching (optional)

The "needs a manual match" section has a **Get AI suggestions for the rest**
button. It sends whatever's still unmatched to Groq's free API
(`llama-3.3-70b-versatile`) and asks it to judge, by product identity alone,
which leftover items are actually the same product — catching things pure
string matching can't (abbreviations, a dropped qualifier word, etc.).

A few things by design:

- **Quantities are never sent to the AI.** Only item numbers, names, and
  vendor. If quantity were part of what the model saw, a genuine quantity
  mismatch could quietly bias it — either toward rejecting a real match or
  toward accepting a wrong one because the numbers happened to look close.
  The AI only ever judges "is this the same product," and the app compares
  quantities itself afterward.
- **Nothing is auto-applied.** Every AI suggestion shows up with a
  Confirm/Dismiss button and its stated confidence + reasoning — same
  human-in-the-loop principle as the rest of the app.
- **It's entirely optional.** Without an API key, the app works exactly as
  before; the button just returns a clear error instead of doing anything.

### Setup

1. Get a free key at [console.groq.com/keys](https://console.groq.com/keys)
   (no credit card required).
2. Local development — copy the example env file and paste your key in:
   ```powershell
   cd "D:\my projects\stock-recon"
   Copy-Item .env.local.example .env.local
   notepad .env.local
   ```
3. On Vercel — Project Settings → Environment Variables → add
   `GROQ_API_KEY` with your key, for the Production (and Preview, if you
   use it) environment. Redeploy after adding it.

The key only ever lives server-side (`app/api/judge-matches/route.ts`) —
it's never sent to or readable from the browser.

## Why some items always need a manual match

S4U reports include every vendor purchase for the day (produce, sauces,
packaging bought locally), not just warehouse-to-branch transfers. Items
that only exist in one report are expected, not a bug — the "Only in
Dynamics" / "Only in S4U" lists are there so you can tell the difference
between "this genuinely isn't a transfer item" and "the name matching
missed something."

## A deliberate non-feature

A handful of items (e.g. items sold in packs of 100) show the Dynamics
qty and S4U qty differing by an exact multiple, which looks like a
pack-size unit conversion. The app does **not** auto-correct for this,
because it isn't a reliable pattern — some items with the exact same
"(100 PCS)"-style naming already match 1:1 with no conversion needed.
Guessing which items need a multiplier and which don't would risk hiding
a genuine data problem. These show up as flagged mismatches on purpose;
worth checking the unit-of-measure setup for that specific SKU in both
systems if you see one.

## Known dependency note

`xlsx` (SheetJS) has two disclosed advisories (prototype pollution,
ReDoS) that the maintainers only patched in versions distributed from
their own CDN rather than the npm registry. This app ships the npm
version (0.18.5) so it installs cleanly anywhere with no extra setup.
Since parsing only ever runs in the browser on files you chose to upload
yourself, the practical exposure is low — but if you want the patched
build, swap the dependency after cloning:

```powershell
npm uninstall xlsx
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

## Local development

```powershell
cd "D:\my projects\stock-recon"
npm install
npm run dev
```

Then open http://localhost:3000

## Project structure

```
app/            Next.js pages (App Router) — page.tsx is the whole UI
app/api/judge-matches/route.ts   Server-side Groq call (keeps the API key private)
components/     UploadZone, ResultsTable, SummaryBar, StatusStamp
lib/            parseDynamics.ts, parseS4U.ts, matching.ts, normalize.ts,
                exportReport.ts, readWorkbook.ts, types.ts,
                aiMatch.ts (client → API route), parseAiPairs.ts (validates
                the AI's response before it's trusted)
```

The matching logic (`lib/normalize.ts`, `lib/matching.ts`) has no
dependency on React or the DOM, so it's straightforward to unit-test or
reuse elsewhere if this logic is ever needed outside the browser.
