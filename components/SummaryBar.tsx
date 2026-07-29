import { Summary } from "@/lib/types";

function Card({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="flex-1 min-w-[110px] bg-paper border border-hairline rounded-md px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-inkmuted font-mono">{label}</p>
      <p className={`text-2xl font-display font-semibold tnum ${colorClass}`}>{value}</p>
    </div>
  );
}

export default function SummaryBar({ summary }: { summary: Summary }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Card label="Dynamics rows" value={summary.totalDynamics} colorClass="text-ink" />
      <Card label="S4U rows" value={summary.totalS4U} colorClass="text-ink" />
      <Card label="Matched" value={summary.matched} colorClass="text-match" />
      <Card label="Mismatched" value={summary.mismatched} colorClass="text-mismatch" />
      <Card label="Only Dynamics" value={summary.onlyDynamics} colorClass="text-onlyone" />
      <Card label="Only S4U" value={summary.onlyS4U} colorClass="text-onlyone" />
      <Card label="Needs review" value={summary.needsReview} colorClass="text-review" />
    </div>
  );
}
