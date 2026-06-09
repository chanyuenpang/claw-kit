export type ProjectKeywordSearchPlanEntry = {
  query: string | null;
  matchedTerms: string[];
  substringTerms: string[];
};

export type ProjectQueryIntent = {
  terms: string[];
  strongTerms: string[];
  weakTerms: string[];
  embeddingText: string;
};

const QUERY_TOKEN_RE = /[\p{L}\p{N}_]+/gu;
const SHORT_CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u3131-\u3163]/u;
const PURE_HAN_RE = /^[\u4e00-\u9fff]+$/u;
const ASCII_WORD_RE = /^[a-z]+$/i;
const STOP_WORDS_EN = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "it",
  "they",
  "them",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "can",
  "may",
  "might",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "over",
  "and",
  "or",
  "but",
  "if",
  "then",
  "because",
  "as",
  "while",
  "when",
  "where",
  "what",
  "which",
  "who",
  "how",
  "why",
  "yesterday",
  "today",
  "tomorrow",
  "earlier",
  "later",
  "recently",
  "ago",
  "just",
  "now",
  "thing",
  "things",
  "stuff",
  "something",
  "anything",
  "everything",
  "nothing",
  "please",
  "help",
  "find",
  "show",
  "get",
  "tell",
  "give",
]);
const STOP_WORDS_ZH = new Set([
  "\u6211",
  "\u6211\u4eec",
  "\u4f60",
  "\u4f60\u4eec",
  "\u4ed6",
  "\u5979",
  "\u5b83",
  "\u4ed6\u4eec",
  "\u8fd9",
  "\u90a3",
  "\u8fd9\u4e2a",
  "\u90a3\u4e2a",
  "\u8fd9\u4e9b",
  "\u90a3\u4e9b",
  "\u7684",
  "\u4e86",
  "\u7740",
  "\u8fc7",
  "\u5f97",
  "\u5730",
  "\u5417",
  "\u5462",
  "\u5427",
  "\u554a",
  "\u5440",
  "\u561b",
  "\u5566",
  "\u662f",
  "\u6709",
  "\u5728",
  "\u88ab",
  "\u628a",
  "\u7ed9",
  "\u8ba9",
  "\u7528",
  "\u5230",
  "\u53bb",
  "\u6765",
  "\u505a",
  "\u8bf4",
  "\u770b",
  "\u627e",
  "\u60f3",
  "\u8981",
  "\u80fd",
  "\u4f1a",
  "\u53ef\u4ee5",
  "\u548c",
  "\u4e0e",
  "\u6216",
  "\u4f46",
  "\u4f46\u662f",
  "\u56e0\u4e3a",
  "\u6240\u4ee5",
  "\u5982\u679c",
  "\u867d\u7136",
  "\u800c",
  "\u4e5f",
  "\u90fd",
  "\u5c31",
  "\u8fd8",
  "\u53c8",
  "\u518d",
  "\u624d",
  "\u53ea",
  "\u4e4b\u524d",
  "\u4ee5\u524d",
  "\u4e4b\u540e",
  "\u4ee5\u540e",
  "\u521a\u624d",
  "\u73b0\u5728",
  "\u6628\u5929",
  "\u4eca\u5929",
  "\u660e\u5929",
  "\u6700\u8fd1",
  "\u4e1c\u897f",
  "\u4e8b\u60c5",
  "\u4e8b",
  "\u4ec0\u4e48",
  "\u54ea\u4e2a",
  "\u54ea\u4e9b",
  "\u600e\u4e48",
  "\u4e3a\u4ec0\u4e48",
  "\u591a\u5c11",
  "\u8bf7",
  "\u5e2e",
  "\u5e2e\u5fd9",
  "\u544a\u8bc9",
]);
const CHINESE_STOP_FRAGMENTS = [
  ...STOP_WORDS_ZH,
  "\u8ddf",
  "\u4e00\u4e0b",
  "\u4e00\u4e0b\u5b50",
  "\u8bf7\u95ee",
  "\u5e2e\u6211",
  "\u7ed9\u6211",
  "\u770b\u770b",
  "\u67e5\u4e0b",
  "\u5173\u4e8e",
  "\u6709\u5173",
].sort((left, right) => right.length - left.length);
const CHINESE_SUFFIX_KEYWORDS = [
  "\u65b9\u6848",
  "\u7cfb\u7edf",
  "\u6a21\u5f0f",
  "\u8bbe\u8ba1",
  "\u5b9e\u73b0",
  "\u6d41\u7a0b",
  "\u89c4\u5219",
  "\u6587\u6863",
  "\u8bf4\u660e",
  "\u529f\u80fd",
  "\u9875\u9762",
  "\u63a5\u53e3",
];
const WEAK_STANDALONE_KEYWORDS = new Set(CHINESE_SUFFIX_KEYWORDS);
const WEAK_CONVERSATIONAL_KEYWORDS = new Set([
  "\u8ba8\u8bba",
  "\u8bb0\u5f55",
  "\u5386\u53f2",
  "\u4e4b\u524d",
  "\u4e4b\u540e",
]);

export function buildProjectKeywordSearchPlan(raw: string): ProjectKeywordSearchPlanEntry[] {
  const terms = extractProjectKeywordTerms(raw);
  if (terms.length === 0) {
    return [];
  }

  const primary = splitKeywordTerms(terms);
  const plan: ProjectKeywordSearchPlanEntry[] = [
    {
      query: primary.matchTerms.length > 0 ? buildAndQuery(primary.matchTerms) : null,
      matchedTerms: terms,
      substringTerms: primary.substringTerms,
    },
  ];

  if (terms.length === 1) {
    return plan;
  }

  const strongTerms = terms.filter((term) => !isWeakStandaloneKeyword(term));
  const standaloneWeakTerms = terms.filter((term) => WEAK_STANDALONE_KEYWORDS.has(term));
  if (strongTerms.length > 0 && standaloneWeakTerms.length > 0) {
    for (const weakTerm of standaloneWeakTerms) {
      const combinedTerms = Array.from(new Set([...strongTerms, weakTerm]));
      if (combinedTerms.length <= 1) {
        continue;
      }
      const entry = splitKeywordTerms(combinedTerms);
      plan.push({
        query: entry.matchTerms.length > 0 ? buildAndQuery(entry.matchTerms) : null,
        matchedTerms: combinedTerms,
        substringTerms: entry.substringTerms,
      });
    }
  }

  for (const term of terms) {
    if (isWeakStandaloneKeyword(term)) {
      continue;
    }
    const entry = splitKeywordTerms([term]);
    plan.push({
      query: entry.matchTerms.length > 0 ? buildAndQuery(entry.matchTerms) : null,
      matchedTerms: [term],
      substringTerms: entry.substringTerms,
    });
  }
  return plan;
}

export function extractProjectKeywordTerms(raw: string): string[] {
  const baseTerms = raw
    .match(QUERY_TOKEN_RE)
    ?.map((term) => normalizeProjectKeywordTerm(term))
    .filter((term) => Boolean(term) && !isProjectStopWord(term) && isValidProjectKeyword(term)) ?? [];

  return Array.from(
    new Set(
      baseTerms.flatMap((term) => expandProjectKeywordTerm(term)).filter(Boolean),
    ),
  );
}

function normalizeProjectKeywordTerm(term: string): string {
  const normalized = term.trim();
  return ASCII_WORD_RE.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function buildProjectQueryIntent(raw: string): ProjectQueryIntent {
  const terms = extractProjectKeywordTerms(raw);
  const strongTerms = terms.filter((term) => !isWeakStandaloneKeyword(term));
  const weakTerms = terms.filter((term) => isWeakStandaloneKeyword(term));
  const embeddingTerms = strongTerms.length > 0 ? strongTerms : terms;

  return {
    terms,
    strongTerms,
    weakTerms,
    embeddingText: embeddingTerms.join(" ").trim() || raw.trim(),
  };
}

function splitKeywordTerms(terms: string[]): {
  matchTerms: string[];
  substringTerms: string[];
} {
  const matchTerms: string[] = [];
  const substringTerms: string[] = [];
  for (const term of terms) {
    if (usesSubstringFallback(term)) {
      substringTerms.push(term);
      continue;
    }
    matchTerms.push(term);
  }
  return { matchTerms, substringTerms };
}

function usesSubstringFallback(term: string): boolean {
  return SHORT_CJK_RE.test(term) && Array.from(term).length < 3;
}

function buildAndQuery(terms: string[]): string {
  return terms.map((term) => `"${term.replaceAll('"', "")}"`).join(" AND ");
}

function isWeakStandaloneKeyword(term: string): boolean {
  return WEAK_STANDALONE_KEYWORDS.has(term) || WEAK_CONVERSATIONAL_KEYWORDS.has(term);
}

function expandProjectKeywordTerm(term: string): string[] {
  if (!PURE_HAN_RE.test(term) || Array.from(term).length <= 4) {
    return [term];
  }

  const normalized = CHINESE_STOP_FRAGMENTS.reduce(
    (value, fragment) => value.replaceAll(fragment, " "),
    term,
  );
  const segments = normalized
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => Array.from(entry).length >= 2 && !isProjectStopWord(entry));
  if (segments.length === 0) {
    return [term];
  }

  const expanded = segments.flatMap((segment) => splitChineseKeywordSegment(segment));
  return expanded.length > 0 ? expanded : [term];
}

function splitChineseKeywordSegment(segment: string): string[] {
  for (const suffix of CHINESE_SUFFIX_KEYWORDS) {
    if (!segment.endsWith(suffix)) {
      continue;
    }
    const prefix = segment.slice(0, segment.length - suffix.length).trim();
    if (Array.from(prefix).length >= 2) {
      return [prefix, suffix];
    }
  }
  return [segment];
}

function isProjectStopWord(term: string): boolean {
  const normalized = term.trim().toLowerCase();
  return STOP_WORDS_EN.has(normalized) || CHINESE_STOP_FRAGMENTS.includes(term);
}

function isValidProjectKeyword(term: string): boolean {
  if (!term.trim()) {
    return false;
  }
  if (ASCII_WORD_RE.test(term) && term.length < 3) {
    return false;
  }
  if (/^\d+$/u.test(term)) {
    return false;
  }
  return true;
}
