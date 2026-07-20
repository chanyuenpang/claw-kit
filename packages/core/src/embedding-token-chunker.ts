export type EmbeddingTextSegment = {
  sourceTextIndex: number;
  text: string;
};

export type TokenWindowOptions = {
  targetTokens: number;
  overlapTokens: number;
  prefixes?: string[];
};

export function splitTextsIntoTokenWindows(
  texts: string[],
  countTokens: (text: string) => number,
  options: TokenWindowOptions,
): EmbeddingTextSegment[] {
  const targetTokens = Math.max(1, Math.floor(options.targetTokens));
  const overlapTokens = Math.max(0, Math.min(Math.floor(options.overlapTokens), targetTokens - 1));
  return texts.flatMap((text, sourceTextIndex) => {
    const prefix = options.prefixes?.[sourceTextIndex]?.trim() ?? "";
    const prefixTokens = prefix ? countTokens(`${prefix}\n\n`) : 0;
    const bodyTargetTokens = Math.max(1, targetTokens - prefixTokens);
    const bodyOverlapTokens = Math.min(overlapTokens, bodyTargetTokens - 1);
    return splitTextIntoTokenWindows(text, countTokens, bodyTargetTokens, bodyOverlapTokens)
      .map((segment) => ({
        sourceTextIndex,
        text: prefix ? `${prefix}\n\n${segment}` : segment,
      }));
  });
}

function splitTextIntoTokenWindows(
  text: string,
  countTokens: (text: string) => number,
  targetTokens: number,
  overlapTokens: number,
): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }
  if (countTokens(normalized) <= targetTokens) {
    return [normalized];
  }

  const segments: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const remaining = normalized.slice(start);
    if (countTokens(remaining) <= targetTokens) {
      segments.push(remaining.trim());
      break;
    }

    const hardEnd = findLargestTokenSafeEnd(normalized, start, countTokens, targetTokens);
    const preferredEnd = findPreferredTextBoundary(normalized, start, hardEnd);
    const end = preferredEnd > start ? preferredEnd : hardEnd;
    const segment = normalized.slice(start, end).trim();
    if (!segment) {
      throw new Error("Tokenizer-aware embedding chunking could not make forward progress.");
    }
    if (countTokens(segment) > targetTokens) {
      throw new Error("Tokenizer-aware embedding chunking produced a segment above the target token limit.");
    }
    segments.push(segment);
    if (end >= normalized.length) {
      break;
    }

    const nextStart = overlapTokens > 0
      ? findOverlapStart(normalized, start, end, countTokens, overlapTokens)
      : end;
    start = nextStart > start ? nextStart : end;
    while (start < normalized.length && /\s/.test(normalized[start] ?? "")) {
      start += 1;
    }
  }
  return segments.filter((segment) => segment.length > 0);
}

function findLargestTokenSafeEnd(
  text: string,
  start: number,
  countTokens: (text: string) => number,
  targetTokens: number,
): number {
  let low = nextCodePointBoundary(text, start + 1);
  let high = text.length;
  let best = low;
  while (low <= high) {
    const middle = previousCodePointBoundary(text, Math.floor((low + high) / 2));
    if (middle <= start) {
      low = nextCodePointBoundary(text, start + 1);
      continue;
    }
    if (countTokens(text.slice(start, middle)) <= targetTokens) {
      best = middle;
      low = nextCodePointBoundary(text, middle + 1);
    } else {
      high = previousCodePointBoundary(text, middle - 1);
    }
  }
  return Math.max(best, nextCodePointBoundary(text, start + 1));
}

function findPreferredTextBoundary(text: string, start: number, hardEnd: number): number {
  const minimum = start + Math.floor((hardEnd - start) * 0.75);
  for (let index = hardEnd - 1; index >= minimum; index -= 1) {
    const value = text[index] ?? "";
    if (/\r|\n|\s|[。！？；.!?;]/.test(value)) {
      return nextCodePointBoundary(text, index + 1);
    }
  }
  return hardEnd;
}

function findOverlapStart(
  text: string,
  windowStart: number,
  windowEnd: number,
  countTokens: (text: string) => number,
  overlapTokens: number,
): number {
  let low = nextCodePointBoundary(text, windowStart + 1);
  let high = previousCodePointBoundary(text, windowEnd - 1);
  let best = windowEnd;
  while (low <= high) {
    const middle = previousCodePointBoundary(text, Math.floor((low + high) / 2));
    if (middle <= windowStart) {
      low = nextCodePointBoundary(text, windowStart + 1);
      continue;
    }
    if (countTokens(text.slice(middle, windowEnd)) <= overlapTokens) {
      best = middle;
      high = previousCodePointBoundary(text, middle - 1);
    } else {
      low = nextCodePointBoundary(text, middle + 1);
    }
  }
  return best < windowEnd ? best : windowEnd;
}

function previousCodePointBoundary(text: string, index: number): number {
  const bounded = Math.max(0, Math.min(index, text.length));
  if (bounded > 0 && bounded < text.length && isLowSurrogate(text.charCodeAt(bounded))) {
    return bounded - 1;
  }
  return bounded;
}

function nextCodePointBoundary(text: string, index: number): number {
  const bounded = Math.max(0, Math.min(index, text.length));
  if (bounded > 0 && bounded < text.length && isLowSurrogate(text.charCodeAt(bounded))) {
    return bounded + 1;
  }
  return bounded;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}
