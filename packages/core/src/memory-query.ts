export type ProjectKeywordSearchPlanEntry = {
  query: string | null;
  matchedTerms: string[];
  substringTerms: string[];
};

const QUERY_TOKEN_RE = /[\p{L}\p{N}_]+/gu;
const SHORT_CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u3131-\u3163]/u;

export function buildProjectKeywordSearchPlan(raw: string): ProjectKeywordSearchPlanEntry[] {
  const terms = Array.from(
    new Set(
      raw
        .match(QUERY_TOKEN_RE)
        ?.map((term) => term.trim())
        .filter(Boolean) ?? [],
    ),
  );
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

  for (const term of terms) {
    const entry = splitKeywordTerms([term]);
    plan.push({
      query: entry.matchTerms.length > 0 ? buildAndQuery(entry.matchTerms) : null,
      matchedTerms: [term],
      substringTerms: entry.substringTerms,
    });
  }
  return plan;
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
