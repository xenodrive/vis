import type {
  FileDiffInfo,
  SessionMessageAssistantTool,
  ToolFileContent,
} from '@opencode-ai/client';

export type ToolSection = { label: string; code: string; path?: string; gutterLines?: string[] };
export type ToolOutput = {
  title: string;
  sections: ToolSection[];
  files: FileDiffInfo[];
  media: ToolFileContent[];
  notices: string[];
  error?: string;
  command?: string;
  statusLabel?: string;
};

/** Decode the model-facing read format emitted by the V2 read plugin. */
export function readPage(text: string): ToolSection {
  const lines = text.split('\n');
  const header = lines.shift()!;
  const match = /^Read file (.*), (?:lines (\d+)-(\d+)|0 lines)$/.exec(header);
  if (!match) throw new Error('Unrecognized V2 read page header');
  const start = Number(match[2] ?? 1);
  const count = match[3] === undefined ? 0 : Number(match[3]) - start + 1;
  if (count < 0 || lines.length < count) throw new Error('Incomplete V2 read page');
  const code = lines.slice(0, count).map((line, index) => {
    const prefix = `${start + index}: `;
    if (!line.startsWith(prefix)) throw new Error('Unexpected V2 read line number');
    return line.slice(prefix.length);
  });
  return {
    label: header,
    path: match[1],
    code: code.join('\n'),
    gutterLines: code.map((_, i) => String(start + i)),
  };
}

function diffFiles(value: unknown): FileDiffInfo[] {
  if (!Array.isArray(value)) throw new Error('V2 tool result has no file diffs');
  return value.map((file) => {
    if (
      !file ||
      typeof file !== 'object' ||
      typeof file.file !== 'string' ||
      typeof file.patch !== 'string' ||
      typeof file.additions !== 'number' ||
      typeof file.deletions !== 'number' ||
      !['added', 'modified', 'deleted'].includes(file.status)
    )
      throw new Error('Invalid V2 file diff');
    return {
      file: file.file,
      patch: file.patch,
      additions: file.additions,
      deletions: file.deletions,
      status: file.status,
    };
  });
}

export function toolOutput(tool: SessionMessageAssistantTool): ToolOutput {
  const state = tool.state;
  const result: ToolOutput = {
    title: tool.name.toUpperCase(),
    sections: [],
    files: [],
    media: [],
    notices: [],
  };
  if (state.status === 'streaming') {
    result.notices.push('Receiving tool arguments…');
    result.sections.push({ label: 'Arguments', code: state.input });
    return result;
  }
  const input = state.input;
  const path = typeof input.path === 'string' ? input.path : undefined;
  if (path) result.title += ` · ${path}`;
  if (state.status === 'error') result.error = state.error.message;
  const content =
    state.status === 'completed' || state.status === 'error' ? (state.content ?? []) : [];
  const text: string[] = [];
  for (const part of content) {
    if (part.type === 'text') text.push(part.text);
    else result.media.push(part);
  }

  switch (tool.name) {
    case 'read':
      for (const value of text) {
        if (value.startsWith('Read file ')) {
          const page = readPage(value);
          result.sections.push(page);
          const count = page.gutterLines!.length;
          const notice = value
            .split('\n')
            .slice(count + 1)
            .filter(
              (line) => !/^\[Output truncated\. Continue reading with offset: \d+\]$/.test(line),
            )
            .join('\n');
          if (notice) result.notices.push(notice);
        } else if (value.startsWith('Read directory ')) {
          const [header, ...entries] = value.split('\n');
          if (
            /^\[Output truncated\. Continue reading with offset: \d+\]$/.test(entries.at(-1) ?? '')
          )
            entries.pop();
          result.sections.push({ label: header!, code: entries.join('\n') });
        } else result.notices.push(value);
      }
      break;
    case 'patch':
    case 'edit':
      if (state.status === 'completed') {
        result.files = diffFiles(state.metadata?.files);
      } else if (tool.name === 'patch' && typeof input.patchText === 'string') {
        result.sections.push({ label: 'Requested patch', code: input.patchText });
      } else if (tool.name === 'edit') {
        if (typeof input.oldString === 'string')
          result.sections.push({ label: 'Original fragment', path, code: input.oldString });
        if (typeof input.newString === 'string')
          result.sections.push({ label: 'Replacement fragment', path, code: input.newString });
      }
      break;
    case 'write': {
      if (typeof input.content === 'string') {
        const lines = input.content === '' ? [] : input.content.replace(/\n$/, '').split('\n');
        result.sections.push({
          label: 'Submitted content',
          path,
          code: lines.join('\n'),
          gutterLines: lines.map((_, i) => String(i + 1)),
        });
      }
      break;
    }
    case 'shell':
      if (typeof state.metadata?.exit === 'number')
        result.statusLabel = `exit ${state.metadata.exit}`;
      if (state.metadata?.timeout === true)
        result.statusLabel = result.statusLabel ? `timeout, ${result.statusLabel}` : 'timeout';
      if (state.status === 'completed') {
        const notice =
          state.metadata?.timeout === true
            ? 'Command timed out before completion.'
            : typeof state.metadata?.exit === 'number'
              ? `Command exited with code ${state.metadata.exit}.`
              : undefined;
        // The V2 shell plugin appends a separate notice after the actual command output.
        if (notice && text.length > 1 && text.at(-1) === notice) text.pop();
      }
      result.command = typeof input.command === 'string' ? input.command : '';
      if (result.command) result.title += ` · ${result.command.split('\n')[0]}`;
      result.sections.push({
        label: 'Shell',
        code: text.reduce(
          (code, output) => code + (code.endsWith('\n') ? '' : '\n') + output,
          result.command ? `$ ${result.command}` : '$',
        ),
      });
      break;
    case 'grep':
      for (const value of text) {
        const lines = value
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .filter((line) => line.length > 0);
        result.sections.push({
          label: 'Matches',
          code: lines.map((line) => line.replace(/^  Line \d+: /, '')).join('\n'),
          gutterLines: lines.map((line) => /^  Line (\d+): /.exec(line)?.[1] ?? ''),
        });
      }
      break;
    default:
      result.sections.push({ label: 'Arguments', code: JSON.stringify(input, null, 2) });
      text.forEach((code) => result.sections.push({ label: 'Output', code }));
  }
  return result;
}
