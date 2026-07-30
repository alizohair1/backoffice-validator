import { DynamicsItem, S4UItem, ParseResult, ParseIssue } from "./types";

/**
 * Combines multiple parsed Dynamics files into one result. Item numbers
 * are aggregated across files exactly like duplicate rows within a single
 * file — same item number, quantities summed.
 */
export function mergeDynamicsResults(
  entries: { fileName: string; result: ParseResult<DynamicsItem> }[]
): ParseResult<DynamicsItem> {
  const byItem = new Map<string, DynamicsItem>();
  const issues: ParseIssue[] = [];
  const detectedHeaders: string[] = [];
  const fileNames: string[] = [];
  const multi = entries.length > 1;

  for (const { fileName, result } of entries) {
    fileNames.push(fileName);
    for (const issue of result.issues) {
      issues.push(multi ? { level: issue.level, message: `[${fileName}] ${issue.message}` } : issue);
    }
    if (detectedHeaders.length === 0) detectedHeaders.push(...result.detectedHeaders);

    for (const item of result.items) {
      const key = item.itemNumber.toUpperCase();
      const existing = byItem.get(key);
      if (existing) {
        existing.transferQty += item.transferQty;
        existing.sourceRows.push(...item.sourceRows);
      } else {
        byItem.set(key, { ...item, sourceRows: [...item.sourceRows] });
      }
    }
  }

  return {
    items: Array.from(byItem.values()),
    issues,
    detectedHeaders,
    sheetName: entries.map((e) => e.result.sheetName).filter(Boolean).join(", "),
    fileName: fileNames.join(", "),
  };
}

/**
 * Combines multiple parsed S4U files into one result. Unlike Dynamics,
 * S4U items aren't deduplicated by any business key — each row is its own
 * line. sourceRow is only ever used internally as an identifier (it's
 * never shown in the UI), so rows from each file are renumbered with a
 * large per-file offset to guarantee they stay unique once combined.
 */
export function mergeS4UResults(
  entries: { fileName: string; result: ParseResult<S4UItem> }[]
): ParseResult<S4UItem> {
  const items: S4UItem[] = [];
  const issues: ParseIssue[] = [];
  const detectedHeaders: string[] = [];
  const fileNames: string[] = [];
  const multi = entries.length > 1;

  entries.forEach(({ fileName, result }, fileIndex) => {
    fileNames.push(fileName);
    for (const issue of result.issues) {
      issues.push(multi ? { level: issue.level, message: `[${fileName}] ${issue.message}` } : issue);
    }
    if (detectedHeaders.length === 0) detectedHeaders.push(...result.detectedHeaders);

    for (const item of result.items) {
      items.push({ ...item, sourceRow: fileIndex * 1_000_000 + item.sourceRow });
    }
  });

  return {
    items,
    issues,
    detectedHeaders,
    sheetName: entries.map((e) => e.result.sheetName).filter(Boolean).join(", "),
    fileName: fileNames.join(", "),
  };
}
