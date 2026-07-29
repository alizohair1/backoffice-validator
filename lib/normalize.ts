// Product-name normalization and fuzzy similarity scoring.
//
// The two systems never spell a product name the same way twice
// ("COKE ZERO (500 ML)" vs "COKE ZERO 500 ML", "SUNLEE SWEET CORN (410 GM)"
// vs "SWEET CORN (SUNLEE) (410 GM)"). Exact-string matching would miss
// almost everything, so we:
//   1. strip punctuation/casing noise,
//   2. sort the remaining words alphabetically (word-order differences
//      stop mattering),
//   3. score similarity with a Levenshtein-distance ratio on the sorted
//      string, and also a token-set overlap ratio (handles one side
//      having an extra descriptive word),
//   4. take the best of the two scores.
//
// This is a heuristic, not a certainty engine — that's why every
// auto-match still carries a confidence score, and anything below the
// high-confidence bar is surfaced for a human to confirm rather than
// silently trusted. That's how we get to 100% accuracy: high-confidence
// matches auto-apply, everything else waits for a human glance.

const UNIT_SYNONYMS: Record<string, string> = {
  ltrs: "ltr",
  litre: "ltr",
  litres: "ltr",
  liter: "ltr",
  liters: "ltr",
  rolls: "roll",
  bottles: "bottle",
  pcs: "pc",
  piece: "pc",
  pieces: "pc",
  packs: "pack",
  gm: "gm",
  gms: "gm",
  grams: "gm",
  gram: "gm",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
};

const NOISE_WORDS = new Set([
  "for",
  "jj",
  "j",
  "the",
  "new",
  "branch",
]);

export function normalizeName(raw: string): string {
  let s = raw.toUpperCase();
  s = s.replace(/<[^>]*>/g, " "); // strip things like "<NEW>"
  s = s.replace(/[()\-|,&.]/g, " ");
  s = s.replace(/[^A-Z0-9\s]/g, " ");
  // "20LTR" and "20 LTR" (or "500ML" / "500 ML") describe the same thing —
  // force a boundary between digits and letters so spacing differences
  // between the two exports stop changing the token count.
  s = s.replace(/(\d)([A-Z])/g, "$1 $2").replace(/([A-Z])(\d)/g, "$1 $2");
  s = s.replace(/\s+/g, " ").trim();

  const words = s
    .split(" ")
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .map((w) => UNIT_SYNONYMS[w] ?? w)
    .filter((w) => !NOISE_WORDS.has(w));

  return words.join(" ");
}

export function sortedTokenString(normalized: string): string {
  return normalized.split(" ").filter(Boolean).sort().join(" ");
}

export function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

// Classic Levenshtein edit distance.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function levenshteinRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 100;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, (1 - dist / maxLen) * 100);
}

function tokenSetRatio(aWords: Set<string>, bWords: Set<string>): number {
  if (aWords.size === 0 && bWords.size === 0) return 100;
  let intersection = 0;
  for (const w of aWords) if (bWords.has(w)) intersection++;
  const union = aWords.size + bWords.size - intersection;
  if (union === 0) return 100;
  return (intersection / union) * 100;
}

/**
 * Similarity score (0-100) between two raw product names.
 * Takes the best of a token-sorted Levenshtein ratio and a token-set
 * overlap ratio, so both pure re-ordering and "one side has an extra
 * qualifier word" cases score well.
 */
export function similarity(rawA: string, rawB: string): number {
  const normA = normalizeName(rawA);
  const normB = normalizeName(rawB);

  const sortedA = sortedTokenString(normA);
  const sortedB = sortedTokenString(normB);
  const ratioScore = levenshteinRatio(sortedA, sortedB);

  const setScore = tokenSetRatio(tokenSet(normA), tokenSet(normB));

  return Math.round(Math.max(ratioScore, setScore) * 10) / 10;
}

export const HIGH_CONFIDENCE_THRESHOLD = 82; // auto-match, trusted outright
export const MEDIUM_CONFIDENCE_THRESHOLD = 65; // auto-match, but flagged "needs review"
export const LOW_CONFIDENCE_FLOOR = 30; // below this, don't even suggest it as a manual candidate
