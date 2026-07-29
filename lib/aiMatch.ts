import { DynamicsItem, S4UItem, AiSuggestion } from "./types";

export interface AiSuggestResult {
  suggestions: AiSuggestion[];
  error: string | null;
  info: string | null;
}

/**
 * Asks the server-side /api/judge-matches route (Groq) to propose pairings
 * for whatever's still unmatched after the lexical matching pass. Only
 * item numbers, names, and vendor are sent — never quantities, so the
 * model's judgment can't be swayed by (or hide) a genuine quantity
 * mismatch.
 */
export async function requestAiSuggestions(
  dynamicsItems: DynamicsItem[],
  s4uItems: S4UItem[]
): Promise<AiSuggestResult> {
  try {
    const res = await fetch("/api/judge-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dynamicsItems: dynamicsItems.map((d) => ({
          itemNumber: d.itemNumber,
          productName: d.productName,
        })),
        s4uItems: s4uItems.map((s) => ({
          sourceRow: s.sourceRow,
          description: s.description,
          vendor: s.vendor,
        })),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { suggestions: [], error: data?.error ?? `Request failed (${res.status})`, info: null };
    }
    return { suggestions: data.suggestions ?? [], error: null, info: data.info ?? null };
  } catch (err) {
    return {
      suggestions: [],
      error: `Couldn't reach the AI matching endpoint: ${(err as Error).message}`,
      info: null,
    };
  }
}
