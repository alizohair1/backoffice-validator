"use client";

import { useCallback, useRef, useState } from "react";
import { ParseIssue } from "@/lib/types";

interface Props {
  title: string;
  system: string;
  hint: string;
  fileLabel: string | null; // e.g. "DynamicsExport.xlsx" (1 file) or "3 files" (multiple)
  fileNames: string[]; // full list, shown underneath the label when there's more than one
  itemCount: number | null;
  detectedHeaders: string[];
  issues: ParseIssue[];
  loading: boolean;
  onFiles: (files: File[]) => void;
}

export default function UploadZone({
  title,
  system,
  hint,
  fileLabel,
  fileNames,
  itemCount,
  detectedHeaders,
  issues,
  loading,
  onFiles,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const ok = fileLabel && errors.length === 0 && !loading;

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFiles(Array.from(files));
    },
    [onFiles]
  );

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-display font-semibold text-ink text-sm tracking-wide uppercase">
          {title}
        </h3>
        <span className="text-[11px] font-mono text-inkmuted uppercase tracking-wider">
          {system}
        </span>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`block cursor-pointer rounded-md border-2 border-dashed transition-colors px-5 py-6 text-center
          ${dragOver ? "border-ink bg-panel" : "border-hairline bg-paper hover:bg-panel/60"}
          ${errors.length > 0 ? "border-mismatch/60 bg-mismatchbg/40" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {!fileLabel && !loading && (
          <>
            <p className="text-sm text-ink font-medium">Drop file(s) or click to browse</p>
            <p className="text-xs text-inkmuted mt-1">{hint}</p>
            <p className="text-[11px] text-inkmuted mt-1">You can select more than one file at once</p>
          </>
        )}
        {loading && <p className="text-sm text-inkmuted">Reading {fileLabel}…</p>}
        {fileLabel && !loading && (
          <>
            <p className="text-sm font-medium text-ink truncate">{fileLabel}</p>
            {fileNames.length > 1 && (
              <p className="text-[11px] text-inkmuted mt-1 truncate">{fileNames.join(" · ")}</p>
            )}
            {ok && itemCount !== null && (
              <p className="text-xs text-match mt-1 font-mono">{itemCount} item rows detected</p>
            )}
            {errors.length > 0 && (
              <p className="text-xs text-mismatch mt-1">Couldn&rsquo;t read this as expected — see below</p>
            )}
            <p className="text-[11px] text-inkmuted mt-2 underline">Choose different file(s)</p>
          </>
        )}
      </label>

      {errors.map((e, i) => (
        <p key={i} className="text-xs text-mismatch mt-2 leading-relaxed">
          {e.message}
        </p>
      ))}
      {warnings.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-review cursor-pointer">
            {warnings.length} row{warnings.length > 1 ? "s" : ""} skipped — details
          </summary>
          <ul className="text-[11px] text-inkmuted mt-1 space-y-0.5 pl-3 list-disc">
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}
      {detectedHeaders.length > 0 && errors.length === 0 && (
        <p className="text-[11px] text-inkmuted mt-2 font-mono truncate">
          columns: {detectedHeaders.join(" · ")}
        </p>
      )}
    </div>
  );
}
