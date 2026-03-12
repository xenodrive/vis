export type DiffSource = {
  file: string;
  before: string;
  after: string;
};

type SourceLine = { text: string; newline: boolean };

function appendLine(lines: SourceLine[], text: string) {
  lines.push({ text, newline: true });
}

function withoutFinalNewline(lines: SourceLine[]) {
  const last = lines.at(-1);
  if (last) last.newline = false;
}

function sourceText(lines: SourceLine[]) {
  return lines.map((line) => `${line.text}${line.newline ? '\n' : ''}`).join('');
}

function isDiffMetadataLine(line: string) {
  return (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('Index: ') ||
    line.startsWith('===') ||
    line.startsWith('---') ||
    line.startsWith('+++') ||
    line.startsWith('***')
  );
}

function parseHunkHeader(line: string) {
  const match = /@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
  if (!match) return undefined;
  return {
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newCount: match[4] === undefined ? 1 : Number(match[4]),
  };
}

export function diffSourceFromFullPatch(file: string, patch: string): DiffSource | undefined {
  const before: SourceLine[] = [];
  const after: SourceLine[] = [];
  let hunkSeen = false;
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  let expectedOldLine = 1;
  let expectedNewLine = 1;
  let previous: '-' | '+' | ' ' | undefined;

  const lines = patch.split('\n');
  for (const [index, line] of lines.entries()) {
    if (line === '' && index === lines.length - 1) continue;

    if (line.startsWith('@@')) {
      const header = parseHunkHeader(line);
      if (!header) return undefined;
      if (
        header.oldStart !== expectedOldLine &&
        !(header.oldStart === 0 && expectedOldLine === 1)
      ) {
        return undefined;
      }
      if (
        header.newStart !== expectedNewLine &&
        !(header.newStart === 0 && expectedNewLine === 1)
      ) {
        return undefined;
      }
      oldLine = header.oldStart;
      newLine = header.newStart;
      expectedOldLine = header.oldStart + header.oldCount;
      expectedNewLine = header.newStart + header.newCount;
      hunkSeen = true;
      inHunk = true;
      previous = undefined;
      continue;
    }

    if (!inHunk && isDiffMetadataLine(line)) {
      inHunk = false;
      previous = undefined;
      continue;
    }

    if (line.startsWith('\\')) {
      if (previous === '-' || previous === ' ') withoutFinalNewline(before);
      if (previous === '+' || previous === ' ') withoutFinalNewline(after);
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith('-')) {
      appendLine(before, line.slice(1));
      oldLine += 1;
      previous = '-';
      continue;
    }

    if (line.startsWith('+')) {
      appendLine(after, line.slice(1));
      newLine += 1;
      previous = '+';
      continue;
    }

    if (line.startsWith(' ')) {
      const text = line.slice(1);
      appendLine(before, text);
      appendLine(after, text);
      oldLine += 1;
      newLine += 1;
      previous = ' ';
      continue;
    }

    return undefined;
  }

  if (!hunkSeen) return undefined;
  if (oldLine !== expectedOldLine && !(oldLine === 0 && expectedOldLine === 1)) return undefined;
  if (newLine !== expectedNewLine && !(newLine === 0 && expectedNewLine === 1)) return undefined;

  return { file, before: sourceText(before), after: sourceText(after) };
}
