import {
  DynamicsItem,
  S4UItem,
  ReconciliationRow,
  MatchStatus,
} from "./types";
import {
  similarity,
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
} from "./normalize";

const QTY_EPSILON = 0.01; // tolerance for floating-point rounding, not a real-world tolerance

function rowId(dIdx: number | null, sIdx: number | null): string {
  return `d${dIdx ?? "x"}-s${sIdx ?? "x"}`;
}

function statusFor(d: DynamicsItem, s: S4UItem): MatchStatus {
  return Math.abs(d.transferQty - s.netQty) <= QTY_EPSILON ? "match" : "mismatch";
}

export interface AutoMatchResult {
  rows: ReconciliationRow[];
  unmatchedDynamics: DynamicsItem[];
  unmatchedS4U: S4UItem[];
}

/**
 * Greedily pairs Dynamics items with S4U items by name-similarity score,
 * highest-confidence pairs first, one-to-one. Anything that never clears
 * the medium-confidence bar is left unmatched for manual pairing.
 */
export function autoMatch(
  dynamicsItems: DynamicsItem[],
  s4uItems: S4UItem[]
): AutoMatchResult {
  interface Candidate {
    dIdx: number;
    sIdx: number;
    score: number;
  }

  const candidates: Candidate[] = [];
  for (let dIdx = 0; dIdx < dynamicsItems.length; dIdx++) {
    for (let sIdx = 0; sIdx < s4uItems.length; sIdx++) {
      const score = similarity(
        dynamicsItems[dIdx].productName,
        s4uItems[sIdx].description
      );
      if (score >= MEDIUM_CONFIDENCE_THRESHOLD) {
        candidates.push({ dIdx, sIdx, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const dUsed = new Set<number>();
  const sUsed = new Set<number>();
  const rows: ReconciliationRow[] = [];

  for (const c of candidates) {
    if (dUsed.has(c.dIdx) || sUsed.has(c.sIdx)) continue;
    dUsed.add(c.dIdx);
    sUsed.add(c.sIdx);
    const d = dynamicsItems[c.dIdx];
    const s = s4uItems[c.sIdx];
    rows.push({
      id: rowId(c.dIdx, c.sIdx),
      status: statusFor(d, s),
      origin: "auto",
      confidence: c.score,
      dynamics: d,
      s4u: s,
      diff: s.netQty - d.transferQty,
    });
  }

  const unmatchedDynamics = dynamicsItems.filter((_, i) => !dUsed.has(i));
  const unmatchedS4U = s4uItems.filter((_, i) => !sUsed.has(i));

  // Stable, readable ordering: mismatches and low-confidence matches first,
  // clean high-confidence matches last.
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "mismatch" ? -1 : 1;
    return (a.confidence ?? 0) - (b.confidence ?? 0);
  });

  return { rows, unmatchedDynamics, unmatchedS4U };
}

/** Build the "only in one file" rows once manual matching is done. */
export function buildUnmatchedRows(
  unmatchedDynamics: DynamicsItem[],
  unmatchedS4U: S4UItem[]
): ReconciliationRow[] {
  const rows: ReconciliationRow[] = [];
  unmatchedDynamics.forEach((d, i) => {
    rows.push({
      id: `onlyD-${d.itemNumber}-${i}`,
      status: "only_dynamics",
      origin: null,
      confidence: null,
      dynamics: d,
      s4u: null,
      diff: null,
    });
  });
  unmatchedS4U.forEach((s, i) => {
    rows.push({
      id: `onlyS-${i}-${s.description}`,
      status: "only_s4u",
      origin: null,
      confidence: null,
      dynamics: null,
      s4u: s,
      diff: null,
    });
  });
  return rows;
}

/** Suggested candidates for a manual-match dropdown, best score first. */
export function suggestMatchesForDynamics(
  target: DynamicsItem,
  pool: S4UItem[],
  floor = 30
) {
  return pool
    .map((s, idx) => ({ idx, s, score: similarity(target.productName, s.description) }))
    .filter((c) => c.score >= floor)
    .sort((a, b) => b.score - a.score);
}

export function suggestMatchesForS4U(
  target: S4UItem,
  pool: DynamicsItem[],
  floor = 30
) {
  return pool
    .map((d, idx) => ({ idx, d, score: similarity(d.productName, target.description) }))
    .filter((c) => c.score >= floor)
    .sort((a, b) => b.score - a.score);
}

export function manualMatchRow(d: DynamicsItem, s: S4UItem): ReconciliationRow {
  return {
    id: `manual-${d.itemNumber}-${s.description}`,
    status: statusFor(d, s),
    origin: "manual",
    confidence: null,
    dynamics: d,
    s4u: s,
    diff: s.netQty - d.transferQty,
  };
}

export function aiMatchRow(
  d: DynamicsItem,
  s: S4UItem,
  confidence: number,
  reason: string
): ReconciliationRow {
  return {
    id: `ai-${d.itemNumber}-${s.description}`,
    status: statusFor(d, s),
    origin: "ai",
    confidence,
    reason,
    dynamics: d,
    s4u: s,
    diff: s.netQty - d.transferQty,
  };
}

export { HIGH_CONFIDENCE_THRESHOLD };
