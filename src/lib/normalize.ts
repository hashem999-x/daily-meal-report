// Client- and server-safe branch name normalization + fuzzy matching.
// Handles Arabic diacritics, hamza variants, punctuation, whitespace, and
// small typos so a mistyped branch name still resolves to the right branch.

export function normalizeName(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase();
  // remove Arabic diacritics
  s = s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  // normalize Arabic letter variants
  s = s.replace(/[إأآا]/g, "ا");
  s = s.replace(/[ىي]/g, "ي");
  s = s.replace(/ة/g, "ه");
  s = s.replace(/ؤ/g, "و");
  s = s.replace(/ئ/g, "ي");
  // strip punctuation and extra whitespace
  s = s.replace(/[\p{P}\p{S}]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[b.length];
}

export type BranchLite = {
  id: string;
  name_ar: string;
  name_en: string;
  code?: string;
};

// Find the branch whose name best matches `input`. Returns null if no
// reasonable match. Tolerates typos: allows edit distance up to ~30% of the
// candidate length (min 1, max 3).
export function matchBranch(
  input: string,
  branches: BranchLite[],
): BranchLite | null {
  const q = normalizeName(input);
  if (!q) return null;

  // Try direct code match first
  for (const b of branches) {
    if (b.code && b.code === input.trim()) return b;
  }

  // Exact / contains match
  const candidates = branches.flatMap((b) => [
    { b, name: normalizeName(b.name_ar) },
    { b, name: normalizeName(b.name_en) },
  ]);
  for (const c of candidates) {
    if (c.name && (c.name === q || q.includes(c.name) || c.name.includes(q))) {
      return c.b;
    }
  }

  // Fuzzy match
  let best: { b: BranchLite; d: number } | null = null;
  for (const c of candidates) {
    if (!c.name) continue;
    const d = levenshtein(q, c.name);
    const max = Math.max(1, Math.min(3, Math.floor(c.name.length * 0.35)));
    if (d <= max && (!best || d < best.d)) best = { b: c.b, d };
  }
  return best?.b ?? null;
}