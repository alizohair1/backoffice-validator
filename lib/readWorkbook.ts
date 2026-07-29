import * as XLSX from "xlsx";

/**
 * Reads an uploaded File (.xlsx, .xls, or .csv) into a grid of raw cell
 * values for the first sheet. SheetJS sniffs the actual file format from
 * its bytes, so the same code path handles all three extensions —
 * including old binary .xls exports that are secretly HTML tables, which
 * is exactly what the S4U "back office" export tends to be.
 */
export async function readFirstSheetAsGrid(
  file: File
): Promise<{ grid: unknown[][]; sheetName: string }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`"${file.name}" doesn't contain any readable sheets.`);
  }
  const sheet = workbook.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  return { grid, sheetName };
}

export function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

export function cellToNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
