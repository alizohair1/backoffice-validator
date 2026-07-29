import * as XLSX from "xlsx";
import { ReconciliationRow } from "./types";

const STATUS_LABEL: Record<ReconciliationRow["status"], string> = {
  match: "Match",
  mismatch: "Mismatch",
  only_dynamics: "Only in Dynamics",
  only_s4u: "Only in S4U",
};

export function downloadReconciliationReport(
  rows: ReconciliationRow[],
  fileNames: { dynamics: string; s4u: string }
) {
  const data = rows.map((r) => ({
    Status: STATUS_LABEL[r.status],
    "Match type": r.origin === "auto" ? "Auto" : r.origin === "manual" ? "Manual" : "",
    "Confidence %": r.confidence ?? "",
    "Dynamics item #": r.dynamics?.itemNumber ?? "",
    "Dynamics product name": r.dynamics?.productName ?? "",
    "Dynamics transfer qty": r.dynamics?.transferQty ?? "",
    "S4U item description": r.s4u?.description ?? "",
    "S4U vendor": r.s4u?.vendor ?? "",
    "S4U N. Qty": r.s4u?.netQty ?? "",
    Difference: r.diff ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 11 },
    { wch: 13 },
    { wch: 15 },
    { wch: 32 },
    { wch: 18 },
    { wch: 32 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `transfer-reconciliation-${today}.xlsx`);
}
