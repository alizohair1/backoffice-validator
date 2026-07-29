import { DynamicsItem, ParseResult, ParseIssue } from "./types";
import { readFirstSheetAsGrid, cellToString, cellToNumber } from "./readWorkbook";

const HEADER_SEARCH_ROWS = 15;

const REQUIRED_COLUMNS: { key: "itemNumber" | "transferQty" | "productName"; label: string; match: RegExp }[] = [
  { key: "itemNumber", label: "Item number", match: /^item\s*(number|no\.?)$/i },
  { key: "transferQty", label: "Transfer quantity", match: /^transfer\s*qu?a?ntity|transfer\s*qty$/i },
  { key: "productName", label: "Product name", match: /^product\s*name$/i },
];

function findHeaderRow(grid: unknown[][]): number {
  const limit = Math.min(grid.length, HEADER_SEARCH_ROWS);
  for (let r = 0; r < limit; r++) {
    const cells = (grid[r] ?? []).map((c) => cellToString(c).toLowerCase());
    const hasItemNumber = cells.some((c) => /^item\s*(number|no\.?)$/i.test(c));
    const hasTransferQty = cells.some((c) => /transfer\s*qu?a?ntity|transfer\s*qty/i.test(c));
    if (hasItemNumber && hasTransferQty) return r;
  }
  return -1;
}

export async function parseDynamicsFile(file: File): Promise<ParseResult<DynamicsItem>> {
  const issues: ParseIssue[] = [];
  const { grid, sheetName } = await readFirstSheetAsGrid(file);

  const headerRowIdx = findHeaderRow(grid);
  if (headerRowIdx === -1) {
    return {
      items: [],
      issues: [
        {
          level: "error",
          message: `Couldn't find a Dynamics-style header (expecting columns like "Item number" and "Transfer quantity") anywhere in the first ${HEADER_SEARCH_ROWS} rows of "${file.name}". This doesn't look like a Dynamics export — double check you uploaded it to the right side.`,
        },
      ],
      detectedHeaders: [],
      sheetName,
      fileName: file.name,
    };
  }

  const headerCells = (grid[headerRowIdx] ?? []).map((c) => cellToString(c));
  const detectedHeaders = headerCells.filter(Boolean);

  const colIndex: Partial<Record<string, number>> = {};
  for (const req of REQUIRED_COLUMNS) {
    const idx = headerCells.findIndex((h) => req.match.test(h.trim()));
    if (idx === -1) {
      issues.push({
        level: "error",
        message: `The Dynamics export changed: expected a "${req.label}" column but it's missing. Columns found instead: ${detectedHeaders.join(", ") || "(none)"}. Update the export or check for a renamed column.`,
      });
    } else {
      colIndex[req.key] = idx;
    }
  }

  if (issues.some((i) => i.level === "error")) {
    return { items: [], issues, detectedHeaders, sheetName, fileName: file.name };
  }

  const iItem = colIndex.itemNumber!;
  const iQty = colIndex.transferQty!;
  const iName = colIndex.productName!;

  const byItem = new Map<string, DynamicsItem>();
  let blankStreak = 0;

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const itemNumber = cellToString(row[iItem]);
    const productName = cellToString(row[iName]);
    const qty = cellToNumber(row[iQty]);

    if (!itemNumber && !productName && qty === null) {
      blankStreak++;
      if (blankStreak >= 3) break; // trailing blank rows / sheet footer
      continue;
    }
    blankStreak = 0;

    if (!itemNumber) {
      issues.push({
        level: "warning",
        message: `Row ${r + 1}: has a product name/quantity but no item number — skipped.`,
      });
      continue;
    }
    if (qty === null) {
      issues.push({
        level: "warning",
        message: `Row ${r + 1} (${itemNumber}): Transfer quantity isn't a number — skipped.`,
      });
      continue;
    }

    const key = itemNumber.toUpperCase();
    const existing = byItem.get(key);
    if (existing) {
      existing.transferQty += qty;
      existing.sourceRows.push(r + 1);
    } else {
      byItem.set(key, {
        itemNumber,
        productName,
        transferQty: qty,
        sourceRows: [r + 1],
      });
    }
  }

  const items = Array.from(byItem.values());
  if (items.length === 0) {
    issues.push({
      level: "error",
      message: `Found the Dynamics header row but no data rows underneath it in "${file.name}".`,
    });
  }

  return { items, issues, detectedHeaders, sheetName, fileName: file.name };
}
