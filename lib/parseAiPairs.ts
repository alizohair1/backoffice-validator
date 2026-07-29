import { AiSuggestion } from "./types";

interface RawPair {
  d?: unknown;
  s?: unknown;
  confidence?: unknown;
  reason?: unknown;
}

/**
 * Validates and cleans whatever the model returned before it's trusted as
 * an AiSuggestion:
 *  - drops pairs referencing an item number / source row that doesn't
 *    actually exist in what we sent (a hallucinated identifier)
 *  - enforces one-to-one (first occurrence wins if the model double-books
 *    an item)
 *  - clamps confidence to 0-100 and truncates an overlong reason
 */
export function parseAiPairs(
  rawPairs: RawPair[] | undefined | null,
  validDynNumbers: Set<string>,
  validS4URows: Set<number>
): AiSuggestion[] {
  const seenD = new Set<string>();
  const seenS = new Set<number>();
  const suggestions: AiSuggestion[] = [];

  for (const p of rawPairs ?? []) {
    if (!p || typeof p.d !== "string" || typeof p.s !== "number") continue;
    if (!validDynNumbers.has(p.d) || !validS4URows.has(p.s)) continue;
    if (seenD.has(p.d) || seenS.has(p.s)) continue;
    seenD.add(p.d);
    seenS.add(p.s);

    suggestions.push({
      dynamicsItemNumber: p.d,
      s4uSourceRow: p.s,
      confidence: Math.max(0, Math.min(100, Math.round(Number(p.confidence) || 0))),
      reason: typeof p.reason === "string" ? p.reason.slice(0, 120) : "",
    });
  }

  return suggestions;
}
