"use client";

import { useMemo, useState } from "react";
import { DynamicsItem, S4UItem, ReconciliationRow, AiSuggestion } from "@/lib/types";
import { suggestMatchesForDynamics, suggestMatchesForS4U } from "@/lib/matching";
import { HIGH_CONFIDENCE_THRESHOLD, MEDIUM_CONFIDENCE_THRESHOLD } from "@/lib/normalize";
import StatusStamp from "./StatusStamp";

interface ResolvedAiSuggestion {
  suggestion: AiSuggestion;
  dynamics: DynamicsItem;
  s4u: S4UItem;
}

interface Props {
  matchedRows: ReconciliationRow[];
  unmatchedDynamics: DynamicsItem[];
  unmatchedS4U: S4UItem[];
  onManualMatch: (dynamicsItemNumber: string, s4uSourceRow: number) => void;
  onRemoveDynamics: (dynamicsItemNumber: string) => void;
  onRemoveS4U: (s4uSourceRow: number) => void;
  aiSuggestions: ResolvedAiSuggestion[];
  aiLoading: boolean;
  aiError: string | null;
  aiInfo: string | null;
  aiHasRun: boolean;
  onRequestAiSuggestions: () => void;
  onConfirmAiSuggestion: (sugg: AiSuggestion, d: DynamicsItem, s: S4UItem) => void;
  onDismissAiSuggestion: (sugg: AiSuggestion) => void;
}

function fmtQty(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export default function ResultsTable({
  matchedRows,
  unmatchedDynamics,
  unmatchedS4U,
  onManualMatch,
  onRemoveDynamics,
  onRemoveS4U,
  aiSuggestions,
  aiLoading,
  aiError,
  aiInfo,
  aiHasRun,
  onRequestAiSuggestions,
  onConfirmAiSuggestion,
  onDismissAiSuggestion,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return matchedRows;
    const q = query.toLowerCase();
    return matchedRows.filter(
      (r) =>
        r.dynamics?.productName.toLowerCase().includes(q) ||
        r.dynamics?.itemNumber.toLowerCase().includes(q) ||
        r.s4u?.description.toLowerCase().includes(q)
    );
  }, [matchedRows, query]);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3 gap-4">
          <h2 className="font-display font-semibold text-ink text-base">
            Matched items
          </h2>
          <input
            type="text"
            placeholder="Filter by name or item #…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm border border-hairline rounded-md px-3 py-1.5 bg-paper focus:outline-none focus:border-ink w-64 max-w-full"
          />
        </div>

        <div className="border border-hairline rounded-md overflow-hidden">
          <div className="recon-scroll overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-panel text-inkmuted text-[11px] uppercase tracking-wider font-mono">
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Dynamics product</th>
                  <th className="text-right px-4 py-2.5 font-medium">Transfer qty</th>
                  <th className="text-left px-4 py-2.5 font-medium">S4U description</th>
                  <th className="text-right px-4 py-2.5 font-medium">N. Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium">Diff</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-hairline ${
                      row.status === "mismatch" ? "bg-mismatchbg/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 align-top">
                      <StatusStamp
                        status={row.status}
                        reviewFlag={
                          row.origin === "auto" &&
                          (row.confidence ?? 0) < HIGH_CONFIDENCE_THRESHOLD
                        }
                      />
                      {row.origin === "auto" && (
                        <p className="text-[10px] text-inkmuted font-mono mt-1">
                          {row.confidence}% match
                        </p>
                      )}
                      {row.origin === "manual" && (
                        <p className="text-[10px] text-inkmuted font-mono mt-1">manual</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <p className="text-ink">{row.dynamics?.productName}</p>
                      <p className="text-[11px] text-inkmuted font-mono">{row.dynamics?.itemNumber}</p>
                    </td>
                    <td className="px-4 py-2.5 align-top text-right tnum text-ink">
                      {fmtQty(row.dynamics?.transferQty)}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <p className="text-ink">{row.s4u?.description}</p>
                      {row.s4u?.vendor && (
                        <p className="text-[11px] text-inkmuted">{row.s4u.vendor}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top text-right tnum text-ink">
                      {fmtQty(row.s4u?.netQty)}
                    </td>
                    <td
                      className={`px-4 py-2.5 align-top text-right tnum font-medium ${
                        row.status === "mismatch" ? "text-mismatch" : "text-inkmuted"
                      }`}
                    >
                      {row.diff !== null && row.diff !== undefined
                        ? (row.diff > 0 ? "+" : "") + fmtQty(row.diff)
                        : "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-inkmuted text-sm">
                      No matched items{query ? " for that search" : " yet"}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {(unmatchedDynamics.length > 0 || unmatchedS4U.length > 0) && (
        <section>
          <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
            <h2 className="font-display font-semibold text-ink text-base">
              Needs a manual match
            </h2>
            <button
              onClick={onRequestAiSuggestions}
              disabled={aiLoading}
              className="text-xs px-3 py-1.5 rounded-md border border-hairline bg-paper hover:bg-panel transition-colors disabled:opacity-50 disabled:cursor-wait shrink-0"
            >
              {aiLoading ? "Asking AI…" : "Get AI suggestions for the rest"}
            </button>
          </div>
          <p className="text-xs text-inkmuted mb-3">
            These didn&rsquo;t clear the {MEDIUM_CONFIDENCE_THRESHOLD}% name-similarity bar against
            anything on the other side. Some are genuinely only in one report (e.g. non-transfer
            purchases in S4U) — pick a match only if one is actually correct.
          </p>

          {aiError && (
            <p className="text-xs text-mismatch mb-3 bg-mismatchbg/40 border border-mismatch/30 rounded-md px-3 py-2">
              {aiError}
            </p>
          )}

          {!aiError && aiInfo && aiSuggestions.length === 0 && (
            <p className="text-xs text-inkmuted mb-3 bg-panel border border-hairline rounded-md px-3 py-2">
              {aiInfo}
            </p>
          )}

          {!aiError && !aiInfo && aiHasRun && !aiLoading && aiSuggestions.length === 0 && (
            <p className="text-xs text-inkmuted mb-3 bg-panel border border-hairline rounded-md px-3 py-2">
              All AI suggestions from that pass have been confirmed or dismissed.
            </p>
          )}

          {aiSuggestions.length > 0 && (
            <div className="mb-5 border border-review/40 bg-reviewbg/30 rounded-md p-3">
              <h3 className="text-xs uppercase tracking-wider text-review font-mono mb-2">
                AI suggested {aiSuggestions.length} match{aiSuggestions.length > 1 ? "es" : ""} — confirm each one
              </h3>
              <ul className="space-y-2">
                {aiSuggestions.map(({ suggestion, dynamics, s4u }) => (
                  <li
                    key={`${suggestion.dynamicsItemNumber}-${suggestion.s4uSourceRow}`}
                    className="bg-paper border border-hairline rounded-md px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {dynamics.productName}{" "}
                        <span className="text-inkmuted">&harr;</span> {s4u.description}
                      </p>
                      <p className="text-[11px] text-inkmuted mt-0.5">
                        {suggestion.confidence}% confident &middot; {suggestion.reason} &middot; qty{" "}
                        {dynamics.transferQty} vs {s4u.netQty}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => onDismissAiSuggestion(suggestion)}
                        className="text-xs px-3 py-1.5 rounded border border-hairline text-inkmuted hover:bg-panel"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => onConfirmAiSuggestion(suggestion, dynamics, s4u)}
                        className="text-xs px-3 py-1.5 rounded bg-ink text-paper hover:opacity-90"
                      >
                        Confirm
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs uppercase tracking-wider text-inkmuted font-mono mb-2">
                Only in Dynamics ({unmatchedDynamics.length})
              </h3>
              <ul className="space-y-2">
                {unmatchedDynamics.map((d) => (
                  <UnmatchedDynamicsRow
                    key={d.itemNumber}
                    item={d}
                    pool={unmatchedS4U}
                    onMatch={(sRow) => onManualMatch(d.itemNumber, sRow)}
                    onRemove={() => onRemoveDynamics(d.itemNumber)}
                  />
                ))}
                {unmatchedDynamics.length === 0 && (
                  <li className="text-sm text-inkmuted">None — every Dynamics row matched.</li>
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-wider text-inkmuted font-mono mb-2">
                Only in S4U ({unmatchedS4U.length})
              </h3>
              <ul className="space-y-2">
                {unmatchedS4U.map((s) => (
                  <UnmatchedS4URow
                    key={s.sourceRow}
                    item={s}
                    pool={unmatchedDynamics}
                    onMatch={(itemNumber) => onManualMatch(itemNumber, s.sourceRow)}
                    onRemove={() => onRemoveS4U(s.sourceRow)}
                  />
                ))}
                {unmatchedS4U.length === 0 && (
                  <li className="text-sm text-inkmuted">None — every S4U row matched.</li>
                )}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function UnmatchedDynamicsRow({
  item,
  pool,
  onMatch,
  onRemove,
}: {
  item: DynamicsItem;
  pool: S4UItem[];
  onMatch: (s4uSourceRow: number) => void;
  onRemove: () => void;
}) {
  const candidates = useMemo(() => suggestMatchesForDynamics(item, pool), [item, pool]);
  const [selected, setSelected] = useState<string>("");

  return (
    <li className="border border-hairline rounded-md px-3 py-2.5 bg-paper">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-ink">{item.productName}</p>
          <p className="text-[11px] text-inkmuted font-mono mb-2">
            {item.itemNumber} · qty {fmtQty(item.transferQty)}
          </p>
        </div>
        <button
          onClick={onRemove}
          title="Remove from this list — won't be matched or exported"
          className="text-[11px] text-inkmuted hover:text-mismatch shrink-0"
        >
          Remove
        </button>
      </div>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 text-xs border border-hairline rounded px-2 py-1.5 bg-white focus:outline-none focus:border-ink"
        >
          <option value="">
            {candidates.length ? "Pick the matching S4U line…" : "No plausible S4U candidates"}
          </option>
          {candidates.map((c) => (
            <option key={c.s.sourceRow} value={c.s.sourceRow}>
              {Math.round(c.score)}% · {c.s.description} (qty {fmtQty(c.s.netQty)})
            </option>
          ))}
        </select>
        <button
          disabled={!selected}
          onClick={() => selected && onMatch(Number(selected))}
          className="text-xs px-3 py-1.5 rounded bg-ink text-paper disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          Match
        </button>
      </div>
    </li>
  );
}

function UnmatchedS4URow({
  item,
  pool,
  onMatch,
  onRemove,
}: {
  item: S4UItem;
  pool: DynamicsItem[];
  onMatch: (itemNumber: string) => void;
  onRemove: () => void;
}) {
  const candidates = useMemo(() => suggestMatchesForS4U(item, pool), [item, pool]);
  const [selected, setSelected] = useState<string>("");

  return (
    <li className="border border-hairline rounded-md px-3 py-2.5 bg-paper">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-ink">{item.description}</p>
          <p className="text-[11px] text-inkmuted font-mono mb-2">
            {item.vendor ? `${item.vendor} · ` : ""}N. Qty {fmtQty(item.netQty)}
          </p>
        </div>
        <button
          onClick={onRemove}
          title="Remove from this list — won't be matched or exported"
          className="text-[11px] text-inkmuted hover:text-mismatch shrink-0"
        >
          Remove
        </button>
      </div>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 text-xs border border-hairline rounded px-2 py-1.5 bg-white focus:outline-none focus:border-ink"
        >
          <option value="">
            {candidates.length ? "Pick the matching Dynamics line…" : "No plausible Dynamics candidates"}
          </option>
          {candidates.map((c) => (
            <option key={c.d.itemNumber} value={c.d.itemNumber}>
              {Math.round(c.score)}% · {c.d.productName} (qty {fmtQty(c.d.transferQty)})
            </option>
          ))}
        </select>
        <button
          disabled={!selected}
          onClick={() => selected && onMatch(selected)}
          className="text-xs px-3 py-1.5 rounded bg-ink text-paper disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          Match
        </button>
      </div>
    </li>
  );
}
