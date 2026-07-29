import { MatchStatus } from "@/lib/types";

const CONFIG: Record<
  MatchStatus,
  { label: string; text: string; bg: string; border: string }
> = {
  match: { label: "Match", text: "text-match", bg: "bg-matchbg", border: "border-match" },
  mismatch: { label: "Mismatch", text: "text-mismatch", bg: "bg-mismatchbg", border: "border-mismatch" },
  only_dynamics: { label: "Only Dynamics", text: "text-onlyone", bg: "bg-onlyonebg", border: "border-onlyone" },
  only_s4u: { label: "Only S4U", text: "text-onlyone", bg: "bg-onlyonebg", border: "border-onlyone" },
};

export default function StatusStamp({
  status,
  reviewFlag,
}: {
  status: MatchStatus;
  reviewFlag?: boolean;
}) {
  const c = CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`stamp ${c.text} ${c.bg} ${c.border}`}>{c.label}</span>
      {reviewFlag && (
        <span className="stamp text-review bg-reviewbg border-review">Review</span>
      )}
    </span>
  );
}
