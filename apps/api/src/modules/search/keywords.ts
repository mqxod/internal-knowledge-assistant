const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before being below between both but by " +
    "can could did do does doing down during each few for from further had has have having he her here hers herself him " +
    "himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other " +
    "our ours ourselves out over own same she should so some such than that the their theirs them themselves then there " +
    "these they this those through to too under until up very was we were what when where which while who whom why will " +
    "with would you your yours yourself yourselves please tell know explain describe many much get got need want may might " +
    "must shall ok okay hi hello thanks thank us let lets i'm i've what's whats whos who's there's"
  ).split(/\s+/),
);

/** Extracts distinct, meaningful search terms from a natural-language question. */
export function extractKeywords(question: string, max = 12): string[] {
  const terms = question
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return [...new Set(terms)].slice(0, max);
}

/** Very small English stemmer used only for coverage scoring (Mongo applies its own stemmer). */
export function stem(term: string): string {
  let t = term;
  for (const [suffix, repl] of [
    ["ies", "y"],
    ["ing", ""],
    ["ed", ""],
    ["es", ""],
    ["s", ""],
  ] as const) {
    if (t.length > suffix.length + 2 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length) + repl;
      break;
    }
  }
  return t;
}

export function containsTerm(haystackLower: string, term: string): boolean {
  const s = stem(term);
  return haystackLower.includes(s.length >= 3 ? s : term);
}
