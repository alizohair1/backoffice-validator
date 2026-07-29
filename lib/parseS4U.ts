import { S4UItem, ParseResult, ParseIssue } from "./types";
import { readFirstSheetAsGrid, cellToString, cellToNumber } from "./readWorkbook";

const HEADER_SEARCH_ROWS = 20;

const REQUIRED_COLUMNS: {
  key: "description" | "uom" | "netQty";
  label: string;
  match: RegExp;
}[] = [
  { key: "description", label: "Item description", match: /^item\s*description$|^description$|^item\s*name$/i },
  { key: "uom", label: "UOM", match: /^uom$/i },
  { key: "netQty", label: "N. Qty (net quantity)", match: /^n\.?\s*qty$|^net\s*qty$|^net\s*quantity$/i },
];

const OPTIONAL_COLUMNS: { key: "qty" | "returnQty"; match: RegExp }[] = [
  { key: "qty", match: /^qty$|^quantity$/i },
  { key: "returnQty", match: /^r\.?\s*qty$|^return\s*qty$/i },
];

function findHeaderRow(grid: unknown[][]): number {
  const limit = Math.min(grid.length, HEADER_SEARCH_ROWS);
  for (let r = 0; r < limit; r++) {
    const cells = (grid[r] ?? []).map((c) => cellToString(c).trim());
    const hasDesc = cells.some((c) => /^item\s*description$|^description$/i.test(c));
    const hasUom = cells.some((c) => /^uom$/i.test(c));
    const hasNetQty = cells.some((c) => /^n\.?\s*qty$|^net\s*qty$/i.test(c));
    if (hasDesc && hasUom && hasNetQty) return r;
  }
  return -1;
}

export async function parseS4UFile(file: File): Promise<ParseResult<S4UItem>> {
  const issues: ParseIssue[] = [];
  const { grid, sheetName } = await readFirstSheetAsGrid(file);

  const headerRowIdx = findHeaderRow(grid);
  if (headerRowIdx === -1) {
    return {
      items: [],
      issues: [
        {
          level: "error",
          message: `Couldn't find an S4U-style header (expecting "ITEM DESCRIPTION", "UOM" and "N. Qty" columns) anywhere in the first ${HEADER_SEARCH_ROWS} rows of "${file.name}". This doesn't look like an S4U back-office export — double check you uploaded it to the right side.`,
        },
      ],
      detectedHeaders: [],
      sheetName,
      fileName: file.name,
    };
  }

  const headerCells = (grid[headerRowIdx] ?? []).map((c) => cellToString(c).trim());
  const detectedHeaders = headerCells.filter(Boolean);

  const colIndex: Partial<Record<string, number>> = {};
  for (const req of REQUIRED_COLUMNS) {
    const idx = headerCells.findIndex((h) => req.match.test(h));
    if (idx === -1) {
      issues.push({
        level: "error",
        message: `The S4U export changed: expected a "${req.label}" column but it's missing. Columns found instead: ${detectedHeaders.join(", ") || "(none)"}. Update the export or check for a renamed column.`,
      });
    } else {
      colIndex[req.key] = idx;
    }
  }
  for (const opt of OPTIONAL_COLUMNS) {
    const idx = headerCells.findIndex((h) => opt.match.test(h));
    if (idx !== -1) colIndex[opt.key] = idx;
  }

  if (issues.some((i) => i.level === "error")) {
    return { items: [], issues, detectedHeaders, sheetName, fileName: file.name };
  }

  const iDesc = colIndex.description!;
  const iUom = colIndex.uom!;
  const iNetQty = colIndex.netQty!;
  const iQty = colIndex.qty;
  const iReturnQty = colIndex.returnQty;

  const items: S4UItem[] = [];
  let currentVendor = "";

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const desc = cellToString(row[iDesc]);
    const uom = cellToString(row[iUom]);
    const netQty = cellToNumber(row[iNetQty]);

    const isItemRow = uom !== "" && netQty !== null;

    if (isItemRow) {
      items.push({
        description: desc,
        uom,
        qty: iQty !== undefined ? cellToNumber(row[iQty]) : null,
        returnQty: iReturnQty !== undefined ? cellToNumber(row[iReturnQty]) : null,
        netQty: netQty as number,
        vendor: currentVendor,
        sourceRow: r + 1,
      });
      continue;
    }

    // Not an item row: it's a vendor header, a subtotal/grand-total line,
    // a blank spacer, or the report footer. A genuine vendor header is the
    // only one of those with real text in the description column that
    // isn't itself a "... TOTAL" marker.
    if (desc && !/total/i.test(desc) && !/^user:/i.test(desc) && !/^page\b/i.test(desc)) {
      currentVendor = desc;
    }
  }

  if (items.length === 0) {
    issues.push({
      level: "error",
      message: `Found the S4U header row but no item rows underneath it in "${file.name}".`,
    });
  }

  return { items, issues, detectedHeaders, sheetName, fileName: file.name };
}
