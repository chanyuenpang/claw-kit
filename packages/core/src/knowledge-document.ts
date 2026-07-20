export type KnowledgeDocumentKind = "truth" | "adr";

export type KnowledgeState = "current" | "accepted" | "historical" | "superseded";

export type KnowledgeEvolutionSection = {
  date: string;
  heading: string;
  startLine: number;
  endLine: number;
};

export type KnowledgeDocumentAnalysis = {
  kind: KnowledgeDocumentKind;
  state: KnowledgeState;
  evolutionSections: KnowledgeEvolutionSection[];
};

export type CompactKnowledgeDocumentOptions = {
  datedSectionsToKeep: number;
  sourcePath?: string;
};

export type CompactKnowledgeDocumentResult = {
  content: string;
  changed: boolean;
  triggered: boolean;
  datedSectionCountBefore: number;
  datedSectionCountAfter: number;
  removedSections: Array<Pick<KnowledgeEvolutionSection, "date" | "heading">>;
};

const DOCUMENT_STATE_COMMENT_PATTERN = /^\s*<!--\s*document-state:\s*(current|accepted|history|historical|superseded)\s*-->\s*$/iu;
const SECTION_STATE_COMMENT_PATTERN = /^\s*<!--\s*state:\s*(current|accepted|history|historical|superseded)\s*-->\s*$/iu;
const DATED_COMMENT_PATTERN = /^\s*<!--\s*dated:\s*(\d{4}-\d{2}-\d{2})\s*-->\s*$/iu;

export function analyzeKnowledgeDocument(content: string, sourcePath = ""): KnowledgeDocumentAnalysis {
  const lines = splitLines(content);
  return {
    kind: resolveDocumentKind(sourcePath),
    state: resolveDocumentState(lines, sourcePath),
    evolutionSections: findEvolutionSections(lines),
  };
}

export function compactKnowledgeDocument(
  content: string,
  options: CompactKnowledgeDocumentOptions,
): CompactKnowledgeDocumentResult {
  validateOptions(options);
  const initial = analyzeKnowledgeDocument(content, options.sourcePath);
  if (initial.evolutionSections.length <= options.datedSectionsToKeep) {
    return {
      content,
      changed: false,
      triggered: false,
      datedSectionCountBefore: initial.evolutionSections.length,
      datedSectionCountAfter: initial.evolutionSections.length,
      removedSections: [],
    };
  }

  let nextContent = content;
  const removedSections: Array<Pick<KnowledgeEvolutionSection, "date" | "heading">> = [];
  while (true) {
    const analysis = analyzeKnowledgeDocument(nextContent, options.sourcePath);
    if (analysis.evolutionSections.length <= options.datedSectionsToKeep) {
      break;
    }
    const oldest = analysis.evolutionSections[0];
    removedSections.push({ date: oldest.date, heading: oldest.heading });
    nextContent = removeLineRange(nextContent, oldest.startLine, oldest.endLine);
  }

  const final = analyzeKnowledgeDocument(nextContent, options.sourcePath);
  return {
    content: nextContent,
    changed: nextContent !== content,
    triggered: true,
    datedSectionCountBefore: initial.evolutionSections.length,
    datedSectionCountAfter: final.evolutionSections.length,
    removedSections,
  };
}

function validateOptions(options: CompactKnowledgeDocumentOptions): void {
  if (!Number.isInteger(options.datedSectionsToKeep) || options.datedSectionsToKeep < 0) {
    throw new TypeError("datedSectionsToKeep must be an integer greater than or equal to 0.");
  }
}

function resolveDocumentKind(sourcePath: string): KnowledgeDocumentKind {
  return /(?:^|[\\/])adr(?:[\\/]|$)/iu.test(sourcePath) ? "adr" : "truth";
}

function resolveDocumentState(lines: string[], sourcePath: string): KnowledgeState {
  const commentState = readDocumentStateComment(lines);
  if (commentState) {
    return commentState;
  }
  const status = readStatusSection(lines);
  if (status) {
    return status;
  }
  return resolveDocumentKind(sourcePath) === "adr" ? "accepted" : "current";
}

function readDocumentStateComment(lines: string[]): KnowledgeState | null {
  for (let index = 0; index < Math.min(lines.length, 30); index += 1) {
    const match = DOCUMENT_STATE_COMMENT_PATTERN.exec((lines[index] ?? "").trim());
    const state = normalizeState(match?.[1]);
    if (state) {
      return state;
    }
  }
  return null;
}

function normalizeState(value: string | undefined): KnowledgeState | null {
  if (value === "current" || value === "accepted" || value === "superseded") {
    return value;
  }
  return value === "history" || value === "historical" ? "historical" : null;
}

function readStatusSection(lines: string[]): KnowledgeState | null {
  for (let index = 0; index < Math.min(lines.length, 30); index += 1) {
    if (!/^##\s+(?:status|状态)\s*$/iu.test((lines[index] ?? "").trim())) {
      continue;
    }
    for (let candidate = index + 1; candidate < Math.min(lines.length, index + 6); candidate += 1) {
      const value = (lines[candidate] ?? "").trim().replace(/[.;。；].*$/u, "").toLowerCase();
      if (!value || value.startsWith("#")) {
        continue;
      }
      return normalizeState(value);
    }
  }
  return null;
}

function findEvolutionSections(lines: string[]): KnowledgeEvolutionSection[] {
  const sections: KnowledgeEvolutionSection[] = [];
  let inHistory = false;
  let active: KnowledgeEvolutionSection | null = null;
  let inFence = false;
  let pendingState: KnowledgeState | null = null;
  let pendingDate: { date: string; startLine: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*(```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const stateComment = SECTION_STATE_COMMENT_PATTERN.exec(line.trim());
    if (stateComment) {
      if (active) {
        active.endLine = index;
        sections.push(active);
        active = null;
      }
      pendingState = normalizeState(stateComment[1]);
      pendingDate = null;
      continue;
    }
    const datedComment = DATED_COMMENT_PATTERN.exec(line.trim());
    if (datedComment) {
      if (active) {
        active.endLine = index;
        sections.push(active);
        active = null;
      }
      pendingDate = { date: datedComment[1], startLine: index };
      continue;
    }
    const headingMatch = /^(#{1,6})\s+/u.exec(line);
    if (!headingMatch) {
      continue;
    }
    const level = headingMatch[1].length;
    if (level <= 2) {
      if (active) {
        active.endLine = index;
        sections.push(active);
        active = null;
      }
      inHistory = pendingState === "historical";
      pendingState = null;
      pendingDate = null;
      continue;
    }
    if (level === 3 && inHistory) {
      const date = pendingDate?.date;
      if (!date) {
        continue;
      }
      if (active) {
        active.endLine = index;
        sections.push(active);
      }
      active = {
        date,
        heading: line.trim(),
        startLine: pendingDate?.startLine ?? index,
        endLine: lines.length,
      };
      pendingDate = null;
    }
  }
  if (active) {
    sections.push(active);
  }
  return sections;
}

function removeLineRange(content: string, startLine: number, endLine: number): string {
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const trailingLineEnding = content.endsWith("\n");
  const lines = splitLines(content);
  lines.splice(startLine, endLine - startLine);
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) {
    lines.pop();
  }
  return `${lines.join(lineEnding)}${trailingLineEnding ? lineEnding : ""}`;
}

function splitLines(content: string): string[] {
  const lines = content.split(/\r?\n/u);
  if (content.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}
