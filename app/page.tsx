"use client";

import { useMemo, useState } from "react";
import UploadZone from "@/components/UploadZone";
import SummaryBar from "@/components/SummaryBar";
import ResultsTable from "@/components/ResultsTable";
import { parseDynamicsFile } from "@/lib/parseDynamics";
import { parseS4UFile } from "@/lib/parseS4U";
import { mergeDynamicsResults, mergeS4UResults } from "@/lib/mergeResults";
import { autoMatch, manualMatchRow, aiMatchRow } from "@/lib/matching";
import { requestAiSuggestions } from "@/lib/aiMatch";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/lib/normalize";
import { downloadReconciliationReport } from "@/lib/exportReport";
import {
  DynamicsItem,
  S4UItem,
  ParseResult,
  ReconciliationRow,
  Summary,
  AiSuggestion,
} from "@/lib/types";

function emptyResult<T>(fileName: string, message: string): ParseResult<T> {
  return {
    items: [],
    issues: [{ level: "error", message }],
    detectedHeaders: [],
    sheetName: "",
    fileName,
  };
}

export default function Page() {
  const [dynFileNames, setDynFileNames] = useState<string[]>([]);
  const [dynLoading, setDynLoading] = useState(false);
  const [dynResult, setDynResult] = useState<ParseResult<DynamicsItem> | null>(null);

  const [s4uFileNames, setS4uFileNames] = useState<string[]>([]);
  const [s4uLoading, setS4uLoading] = useState(false);
  const [s4uResult, setS4uResult] = useState<ParseResult<S4UItem> | null>(null);

  // Rows confirmed outside the initial lexical pass — from a manual pick
  // or a confirmed AI suggestion. `origin` on each row tells them apart.
  const [extraRows, setExtraRows] = useState<ReconciliationRow[]>([]);
  const [usedDyn, setUsedDyn] = useState<Set<string>>(new Set());
  const [usedS4U, setUsedS4U] = useState<Set<number>>(new Set());

  // Items explicitly dismissed from "needs a manual match" — excluded
  // from the list, the summary counts, and the export, same as a match.
  const [removedDyn, setRemovedDyn] = useState<Set<string>>(new Set());
  const [removedS4U, setRemovedS4U] = useState<Set<number>>(new Set());

  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInfo, setAiInfo] = useState<string | null>(null);
  const [aiHasRun, setAiHasRun] = useState(false);

  function resetMatchState() {
    setExtraRows([]);
    setUsedDyn(new Set());
    setUsedS4U(new Set());
    setRemovedDyn(new Set());
    setRemovedS4U(new Set());
    setAiSuggestions([]);
    setAiError(null);
    setAiInfo(null);
    setAiHasRun(false);
  }

  async function handleDynFiles(files: File[]) {
    setDynFileNames(files.map((f) => f.name));
    setDynLoading(true);
    resetMatchState();
    try {
      const parsed = await Promise.all(
        files.map(async (file) => {
          try {
            return await parseDynamicsFile(file);
          } catch (err) {
            return emptyResult<DynamicsItem>(file.name, `Couldn't read "${file.name}": ${(err as Error).message}`);
          }
        })
      );
      const merged = mergeDynamicsResults(files.map((f, i) => ({ fileName: f.name, result: parsed[i] })));
      setDynResult(merged);
    } finally {
      setDynLoading(false);
    }
  }

  async function handleS4UFiles(files: File[]) {
    setS4uFileNames(files.map((f) => f.name));
    setS4uLoading(true);
    resetMatchState();
    try {
      const parsed = await Promise.all(
        files.map(async (file) => {
          try {
            return await parseS4UFile(file);
          } catch (err) {
            return emptyResult<S4UItem>(file.name, `Couldn't read "${file.name}": ${(err as Error).message}`);
          }
        })
      );
      const merged = mergeS4UResults(files.map((f, i) => ({ fileName: f.name, result: parsed[i] })));
      setS4uResult(merged);
    } finally {
      setS4uLoading(false);
    }
  }

  const dynReady = !!dynResult && dynResult.issues.every((i) => i.level !== "error") && dynResult.items.length > 0;
  const s4uReady = !!s4uResult && s4uResult.issues.every((i) => i.level !== "error") && s4uResult.items.length > 0;

  const engine = useMemo(() => {
    if (!dynReady || !s4uReady) return null;
    return autoMatch(dynResult!.items, s4uResult!.items);
  }, [dynReady, s4uReady, dynResult, s4uResult]);

  const unmatchedDynamics = useMemo(() => {
    if (!engine) return [];
    return engine.unmatchedDynamics.filter((d) => !usedDyn.has(d.itemNumber) && !removedDyn.has(d.itemNumber));
  }, [engine, usedDyn, removedDyn]);

  const unmatchedS4U = useMemo(() => {
    if (!engine) return [];
    return engine.unmatchedS4U.filter((s) => !usedS4U.has(s.sourceRow) && !removedS4U.has(s.sourceRow));
  }, [engine, usedS4U, removedS4U]);

  const matchedRows = useMemo(() => {
    if (!engine) return [];
    return [...engine.rows, ...extraRows].sort((a, b) => {
      if (a.status !== b.status) return a.status === "mismatch" ? -1 : 1;
      return (a.confidence ?? 0) - (b.confidence ?? 0);
    });
  }, [engine, extraRows]);

  // Resolve pending AI suggestions against the current unmatched pools so
  // stale suggestions (already confirmed/dismissed/removed, or whose
  // partner was just claimed by a manual match) quietly disappear.
  const resolvedAiSuggestions = useMemo(() => {
    return aiSuggestions
      .map((sugg) => {
        const d = unmatchedDynamics.find((x) => x.itemNumber === sugg.dynamicsItemNumber);
        const s = unmatchedS4U.find((x) => x.sourceRow === sugg.s4uSourceRow);
        if (!d || !s) return null;
        return { suggestion: sugg, dynamics: d, s4u: s };
      })
      .filter((x): x is { suggestion: AiSuggestion; dynamics: DynamicsItem; s4u: S4UItem } => x !== null);
  }, [aiSuggestions, unmatchedDynamics, unmatchedS4U]);

  function handleManualMatch(dynamicsItemNumber: string, s4uSourceRow: number) {
    const d = engine?.unmatchedDynamics.find((x) => x.itemNumber === dynamicsItemNumber);
    const s = engine?.unmatchedS4U.find((x) => x.sourceRow === s4uSourceRow);
    if (!d || !s) return;
    setExtraRows((prev) => [...prev, manualMatchRow(d, s)]);
    setUsedDyn((prev) => new Set(prev).add(d.itemNumber));
    setUsedS4U((prev) => new Set(prev).add(s.sourceRow));
  }

  function handleRemoveDynamics(itemNumber: string) {
    setRemovedDyn((prev) => new Set(prev).add(itemNumber));
  }

  function handleRemoveS4U(sourceRow: number) {
    setRemovedS4U((prev) => new Set(prev).add(sourceRow));
  }

  async function handleRequestAiSuggestions() {
    setAiLoading(true);
    setAiError(null);
    setAiInfo(null);
    const result = await requestAiSuggestions(unmatchedDynamics, unmatchedS4U);
    setAiLoading(false);
    setAiHasRun(true);
    if (result.error) {
      setAiError(result.error);
      return;
    }
    setAiInfo(result.info);
    setAiSuggestions(result.suggestions);
  }

  function handleConfirmAiSuggestion(sugg: AiSuggestion, d: DynamicsItem, s: S4UItem) {
    setExtraRows((prev) => [...prev, aiMatchRow(d, s, sugg.confidence, sugg.reason)]);
    setUsedDyn((prev) => new Set(prev).add(d.itemNumber));
    setUsedS4U((prev) => new Set(prev).add(s.sourceRow));
    setAiSuggestions((prev) =>
      prev.filter((x) => !(x.dynamicsItemNumber === sugg.dynamicsItemNumber && x.s4uSourceRow === sugg.s4uSourceRow))
    );
  }

  function handleDismissAiSuggestion(sugg: AiSuggestion) {
    setAiSuggestions((prev) =>
      prev.filter((x) => !(x.dynamicsItemNumber === sugg.dynamicsItemNumber && x.s4uSourceRow === sugg.s4uSourceRow))
    );
  }

  const summary: Summary | null = useMemo(() => {
    if (!engine) return null;
    const matched = matchedRows.filter((r) => r.status === "match").length;
    const mismatched = matchedRows.filter((r) => r.status === "mismatch").length;
    const needsReview = matchedRows.filter(
      (r) => r.origin === "auto" && (r.confidence ?? 0) < HIGH_CONFIDENCE_THRESHOLD
    ).length;
    return {
      totalDynamics: dynResult!.items.length,
      totalS4U: s4uResult!.items.length,
      matched,
      mismatched,
      onlyDynamics: unmatchedDynamics.length,
      onlyS4U: unmatchedS4U.length,
      needsReview,
    };
  }, [engine, matchedRows, unmatchedDynamics, unmatchedS4U, dynResult, s4uResult]);

  const showResults = engine && summary;

  const dynFileLabel = dynFileNames.length === 0 ? null : dynFileNames.length === 1 ? dynFileNames[0] : `${dynFileNames.length} files`;
  const s4uFileLabel = s4uFileNames.length === 0 ? null : s4uFileNames.length === 1 ? s4uFileNames[0] : `${s4uFileNames.length} files`;

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-hairline">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-inkmuted mb-2">
            Transfer reconciliation
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink">
            Dynamics <span className="text-inkmuted">vs</span> S4U
          </h1>
          <p className="text-sm text-inkmuted mt-2 max-w-2xl">
            Upload the Dynamics transfer export(s) and the S4U back-office report(s) for the same
            date — each side accepts more than one file. Product names never spell out the same
            way twice between the two systems — this matches them anyway, checks Transfer
            quantity against N. Qty, and tells you exactly where the two disagree.
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="flex flex-col md:flex-row gap-6">
          <UploadZone
            title="Dynamics export"
            system="MS Dynamics"
            hint=".xlsx / .xls / .csv — needs Item number, Transfer quantity, Product name"
            fileLabel={dynFileLabel}
            fileNames={dynFileNames}
            itemCount={dynResult?.items.length ?? null}
            detectedHeaders={dynResult?.detectedHeaders ?? []}
            issues={dynResult?.issues ?? []}
            loading={dynLoading}
            onFiles={handleDynFiles}
          />
          <UploadZone
            title="S4U back office"
            system="S4U Grip"
            hint=".xlsx / .xls / .csv — needs Item description, UOM, N. Qty"
            fileLabel={s4uFileLabel}
            fileNames={s4uFileNames}
            itemCount={s4uResult?.items.length ?? null}
            detectedHeaders={s4uResult?.detectedHeaders ?? []}
            issues={s4uResult?.issues ?? []}
            loading={s4uLoading}
            onFiles={handleS4UFiles}
          />
        </section>

        {showResults && (
          <>
            <section className="flex items-center justify-between gap-4 flex-wrap">
              <SummaryBar summary={summary} />
              <button
                onClick={() =>
                  downloadReconciliationReport(
                    [
                      ...matchedRows,
                      ...unmatchedDynamics.map((d) => ({
                        id: `x-${d.itemNumber}`,
                        status: "only_dynamics" as const,
                        origin: null,
                        confidence: null,
                        dynamics: d,
                        s4u: null,
                        diff: null,
                      })),
                      ...unmatchedS4U.map((s) => ({
                        id: `x-${s.sourceRow}`,
                        status: "only_s4u" as const,
                        origin: null,
                        confidence: null,
                        dynamics: null,
                        s4u: s,
                        diff: null,
                      })),
                    ],
                    { dynamics: dynFileLabel ?? "", s4u: s4uFileLabel ?? "" }
                  )
                }
                className="text-sm px-4 py-2.5 rounded-md bg-ink text-paper font-medium hover:opacity-90 transition-opacity shrink-0"
              >
                Export report (.xlsx)
              </button>
            </section>

            <ResultsTable
              matchedRows={matchedRows}
              unmatchedDynamics={unmatchedDynamics}
              unmatchedS4U={unmatchedS4U}
              onManualMatch={handleManualMatch}
              onRemoveDynamics={handleRemoveDynamics}
              onRemoveS4U={handleRemoveS4U}
              aiSuggestions={resolvedAiSuggestions}
              aiLoading={aiLoading}
              aiError={aiError}
              aiInfo={aiInfo}
              aiHasRun={aiHasRun}
              onRequestAiSuggestions={handleRequestAiSuggestions}
              onConfirmAiSuggestion={handleConfirmAiSuggestion}
              onDismissAiSuggestion={handleDismissAiSuggestion}
            />
          </>
        )}

        {!showResults && (dynFileLabel || s4uFileLabel) && (
          <p className="text-sm text-inkmuted text-center py-12">
            {dynLoading || s4uLoading
              ? "Reading files…"
              : "Upload both sides (with no errors above) to run the comparison."}
          </p>
        )}
      </div>
    </main>
  );
}
