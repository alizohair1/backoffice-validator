// Shared types for the reconciliation engine.

export interface DynamicsItem {
  itemNumber: string;
  productName: string;
  transferQty: number;
  /** Row numbers (1-based, as in the original sheet) this item's qty was summed from. */
  sourceRows: number[];
}

export interface S4UItem {
  /** The raw item description exactly as printed in the report. */
  description: string;
  uom: string;
  qty: number | null;
  returnQty: number | null;
  netQty: number;
  /** Vendor / party this line was grouped under in the report. */
  vendor: string;
  sourceRow: number;
}

export type MatchStatus = "match" | "mismatch" | "only_dynamics" | "only_s4u";
export type MatchOrigin = "auto" | "manual" | "ai";

export interface ReconciliationRow {
  id: string;
  status: MatchStatus;
  origin: MatchOrigin | null;
  confidence: number | null; // 0-100, null when there's nothing to score (only_* rows)
  reason?: string; // short explanation, set for AI-suggested pairs
  dynamics: DynamicsItem | null;
  s4u: S4UItem | null;
  diff: number | null; // s4u.netQty - dynamics.transferQty, null if either side missing
}

/** A pending AI suggestion, awaiting a human confirm/dismiss. */
export interface AiSuggestion {
  dynamicsItemNumber: string;
  s4uSourceRow: number;
  confidence: number;
  reason: string;
}

export interface ParseIssue {
  level: "error" | "warning";
  message: string;
}

export interface ParseResult<T> {
  items: T[];
  issues: ParseIssue[];
  detectedHeaders: string[];
  sheetName: string;
  fileName: string;
}

export interface Summary {
  totalDynamics: number;
  totalS4U: number;
  matched: number;
  mismatched: number;
  onlyDynamics: number;
  onlyS4U: number;
  needsReview: number; // auto-matched rows below the high-confidence threshold, surfaced for a quick glance
}
