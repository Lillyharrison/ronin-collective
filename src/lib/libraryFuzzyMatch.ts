/**
 * libraryFuzzyMatch — shared fuzzy matching utility for Order Library items.
 *
 * Used by both:
 *  - The library UI search bar
 *  - The Ronin AI `add_to_shopping_list` tool
 *
 * Algorithm: token-based Jaccard + bigram similarity, biased toward exact
 * substring hits and alias matches. Returns a confidence score 0..1.
 *
 * Confidence tiers (consumers decide policy):
 *   ≥ 0.80  — auto-use
 *   0.50..0.79 — confirm with user ("did you mean…?")
 *   < 0.50  — no match
 */

export interface LibraryMatchCandidate {
  id: string;
  name: string;
  search_aliases?: string[] | null;
}

export interface LibraryMatchResult<T extends LibraryMatchCandidate> {
  item: T;
  score: number;
  matchedOn: "name" | "alias" | "fuzzy";
}

const norm = (s: string): string =>
  s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ");

const tokenize = (s: string): string[] =>
  norm(s).split(" ").filter(Boolean);

const bigrams = (s: string): Set<string> => {
  const n = norm(s).replace(/\s/g, "");
  const out = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
};

/** Score a single query against a single candidate. Returns 0..1. */
export function scoreCandidate(
  query: string,
  candidate: LibraryMatchCandidate,
): { score: number; matchedOn: "name" | "alias" | "fuzzy" } {
  const q = norm(query);
  if (!q) return { score: 0, matchedOn: "fuzzy" };

  const name = norm(candidate.name);
  const aliases = (candidate.search_aliases ?? []).map(norm).filter(Boolean);

  // 1. Exact name match
  if (name === q) return { score: 1, matchedOn: "name" };

  // 2. Exact alias match
  if (aliases.includes(q)) return { score: 0.98, matchedOn: "alias" };

  // 3. Substring containment (either direction)
  if (name.includes(q) || q.includes(name)) {
    const ratio = Math.min(q.length, name.length) / Math.max(q.length, name.length);
    return { score: 0.75 + 0.2 * ratio, matchedOn: "name" };
  }
  for (const a of aliases) {
    if (a.includes(q) || q.includes(a)) {
      const ratio = Math.min(q.length, a.length) / Math.max(q.length, a.length);
      return { score: 0.7 + 0.2 * ratio, matchedOn: "alias" };
    }
  }

  // 4. Token overlap + bigram similarity (combined)
  const qTokens = new Set(tokenize(q));
  const nTokens = new Set(tokenize(name));
  const tokenScore = jaccard(qTokens, nTokens);

  const bigramScore = jaccard(bigrams(q), bigrams(name));

  // Take best alias score too
  let aliasBest = 0;
  for (const a of aliases) {
    const s = jaccard(bigrams(q), bigrams(a));
    if (s > aliasBest) aliasBest = s;
  }

  const fuzzy = Math.max(0.6 * bigramScore + 0.4 * tokenScore, aliasBest * 0.9);
  return { score: Math.min(fuzzy, 0.79), matchedOn: aliasBest > bigramScore ? "alias" : "fuzzy" };
}

/**
 * Find best matching library items for a query.
 * Returns results sorted by score desc, filtered by minScore.
 */
export function findLibraryMatches<T extends LibraryMatchCandidate>(
  query: string,
  candidates: T[],
  opts: { minScore?: number; limit?: number } = {},
): LibraryMatchResult<T>[] {
  const minScore = opts.minScore ?? 0.5;
  const limit = opts.limit ?? 5;

  const scored: LibraryMatchResult<T>[] = candidates
    .map((c) => {
      const { score, matchedOn } = scoreCandidate(query, c);
      return { item: c, score, matchedOn };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/** Confidence tier helper for consumer policy decisions. */
export type MatchTier = "auto" | "confirm" | "none";
export function tierFor(score: number): MatchTier {
  if (score >= 0.8) return "auto";
  if (score >= 0.5) return "confirm";
  return "none";
}
