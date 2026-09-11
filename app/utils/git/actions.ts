import type { GitFileStatus, GitStatusCode } from '../../types/git';
import previewAwk from './git-preview.awk?raw';
import { gitPath } from './git-path';

export const DIFF_LINE_CHARACTERS = 1000;
export const DIFF_HUNK_LINES = 1000;
export const PROMPT_DIFF_CHARACTERS = 100000;
export type GitHunk = { patch: string; omittedLines: number; omittedCharacters: number[] };
export type GitPreview = {
  header: string;
  hunks: GitHunk[];
  binary: boolean;
  hash: string;
  selectable: boolean;
};
export type GitHunkSelection = { file: GitPatch; hash: string; indices: number[] };

export type GitAction = 'stage' | 'unstage' | 'commit-staged' | 'commit-all';
export type GitDiffMode = 'staged' | 'unstaged' | 'changes' | 'untracked';
export type GitSource = {
  before: string;
  after: string;
  beforeBase64: string;
  afterBase64: string;
  preview: GitPreview;
};
export type GitPatch = {
  file: string;
  change: string;
  additions: number;
  deletions: number;
  binary: boolean;
  pathBase64: string;
};
export type GitSnapshot = {
  root: string;
  head: string;
  branchRef: string;
  status: Record<string, GitFileStatus>;
  staged: GitPatch[];
  unstaged: GitPatch[];
  changes: GitPatch[];
  untracked: GitPatch[];
};

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const DIFF =
  'git -c core.quotePath=true diff --no-ext-diff --no-textconv --no-renames --no-relative --no-color --src-prefix=a/ --dst-prefix=b/ --submodule=short --ignore-submodules=none';
const SETUP = `set -eu
export GIT_LITERAL_PATHSPECS=1
export GIT_OPTIONAL_LOCKS=0
cd "$(git rev-parse --show-toplevel)"
capture() {
  captured=$(
    exec 4>&1
    status=$( { { (set -e; eval "$1"); result=$?; printf '%s' "$result" >&3; } | base64 >&4; } 3>&1 )
    printf 'VIS_EXIT_%s' "$status"
  )
  case "$captured" in
    *VIS_EXIT_0) encoded=\${captured%VIS_EXIT_0} ;;
    *) printf '%s\\n' 'Git command failed.' >&2; return 1 ;;
  esac
}
`;
const SEPARATOR = '\nVIS_GIT_SECTION\n';

function section(command: string) {
  return `capture ${shellQuote(command)}
printf '%s' "$encoded"
printf '\\nVIS_GIT_SECTION\\n'
`;
}

function diffSections(args: string) {
  return section(`${DIFF} --raw --numstat ${args}`);
}

function decode(value: string) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    Uint8Array.from(atob(value.replaceAll(/\s/g, '')), (char) => char.charCodeAt(0)),
  );
}

export function parsePatches(stats: string): GitPatch[] {
  const changes = new Map<string, string>();
  for (const line of stats.split('\n').filter((line) => line.startsWith(':'))) {
    const match = /^:\d+ \d+ [a-f\d]+ [a-f\d]+ ([A-Z])\t(.+)$/.exec(line);
    if (!match) throw new Error('Invalid Git change metadata.');
    changes.set(match[2], match[1]);
  }
  return stats
    .split('\n')
    .filter((line) => line && !line.startsWith(':'))
    .map((entry) => {
      const match = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/.exec(entry);
      if (!match) throw new Error('Invalid Git diff statistics.');
      const change = changes.get(match[3]);
      if (!change) throw new Error('Missing Git change metadata.');
      return {
        ...gitPath(match[3]),
        additions: match[1] === '-' ? 0 : Number(match[1]),
        deletions: match[2] === '-' ? 0 : Number(match[2]),
        binary: match[1] === '-',
        change,
      };
    });
}

function parseStatus(text: string): GitSnapshot['status'] {
  const entries = text.split('\n');
  const result: GitSnapshot['status'] = Object.create(null);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const index = entry[0].trim();
    const worktree = entry[1].trim();
    if (![index, worktree].every((code) => ['', 'M', 'A', 'D', 'R', 'C', 'T', '?'].includes(code)))
      throw new Error('Resolve Git conflicts before staging or committing changes.');
    const path = gitPath(entry.slice(3)).file;
    result[path] = { path, index: index as GitStatusCode, worktree: worktree as GitStatusCode };
  }
  return result;
}

export function displayHunk(hunk: GitHunk) {
  const lines = hunk.patch.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return (
    lines
      .map(
        (line, index) =>
          line +
          (hunk.omittedCharacters[index]
            ? `\n\\ [${hunk.omittedCharacters[index]} characters omitted]`
            : ''),
      )
      .join('\n') +
    (hunk.omittedLines ? `\n\\ [${hunk.omittedLines} hunk lines omitted]` : '') +
    '\n'
  );
}

function setPath(file: GitPatch) {
  return `path=$(printf '%s' ${shellQuote(file.pathBase64)} | base64 -d; printf '.')\npath=\${path%.}\n`;
}

function filePatch(snapshot: GitSnapshot, mode: GitDiffMode, file: GitPatch, statistics = false) {
  const base = snapshot.head
    ? shellQuote(snapshot.head)
    : '"$(git hash-object -t tree --stdin < /dev/null)"';
  const args =
    mode === 'untracked'
      ? '--no-index'
      : mode === 'staged'
        ? `--cached ${base}`
        : mode === 'changes'
          ? base
          : '';
  return (
    setPath(file) +
    `${DIFF} ${statistics ? '--numstat' : '--binary --full-index --unified=3 --inter-hunk-context=0'} ${args} -- ${mode === 'untracked' ? '/dev/null ' : ''}"$path"${mode === 'untracked' ? ' || test "$?" = 1' : ''}\n`
  );
}

export function createGitActions(
  inspect: (
    command: string,
    options?: { signal?: AbortSignal; timeout?: number },
  ) => Promise<string>,
  run: (command: string, title?: string) => Promise<number | undefined>,
) {
  async function readEncoded(
    script: string,
    count: number,
    options?: { signal?: AbortSignal; timeout?: number },
  ) {
    const output = await inspect(`${SETUP}${script}printf 'VIS_GIT_DONE\\n'`, options);
    const parts = output.split(SEPARATOR);
    if (parts.length !== count + 1 || parts.at(-1) !== 'VIS_GIT_DONE\n')
      throw new Error(`Git inspection failed: ${output.trim()}`);
    return parts.slice(0, -1).map((part) => part.replaceAll(/\s/g, ''));
  }

  async function read(
    script: string,
    count: number,
    options?: { signal?: AbortSignal; timeout?: number },
  ) {
    return (await readEncoded(script, count, options)).map(decode);
  }

  async function snapshot(signal?: AbortSignal): Promise<GitSnapshot> {
    const parts = await read(
      section('pwd -P') +
        section('git rev-parse --verify -q HEAD || test "$?" = 1') +
        section(
          'git -c core.quotePath=true status --porcelain=v1 --no-renames --untracked-files=all',
        ) +
        section('git symbolic-ref -q HEAD || test "$?" = 1'),
      4,
      { signal },
    );
    const result: GitSnapshot = {
      root: parts[0].trimEnd(),
      head: parts[1].trim(),
      branchRef: parts[3].trim(),
      status: parseStatus(parts[2]),
      staged: [],
      unstaged: [],
      changes: [],
      untracked: [],
    };
    for (const line of parts[2].split('\n').filter(Boolean)) {
      const file: GitPatch = {
        ...gitPath(line.slice(3)),
        change: '',
        additions: 0,
        deletions: 0,
        binary: false,
      };
      const index = line[0].trim();
      const working = line[1].trim();
      if (index === '?') result.untracked.push({ ...file, change: 'A' });
      else {
        if (index) result.staged.push({ ...file, change: index });
        if (working) result.unstaged.push({ ...file, change: working });
        result.changes.push({ ...file, change: working || index });
      }
    }
    return result;
  }

  async function statistics() {
    const parts = await read(diffSections('--cached') + diffSections(''), 2);
    return { staged: parsePatches(parts[0]), unstaged: parsePatches(parts[1]) };
  }

  async function inspectFile(
    snapshot: GitSnapshot,
    mode: GitDiffMode,
    file: GitPatch,
    includeSource: boolean,
    signal?: AbortSignal,
  ): Promise<GitSource> {
    function content(kind: 'head' | 'index' | 'working' | 'empty') {
      if (kind === 'empty' || (kind === 'head' && !snapshot.head)) return ':';
      if (kind === 'working')
        return `if test -L "$path"; then
target=$(readlink "$path"; printf '.')
target=\${target%.}
printf '%s' "\${target%?}"
elif test -f "$path"; then cat -- "$path"
elif test -d "$path"; then printf 'Subproject commit %s\\n' "$(git -C "$path" rev-parse HEAD)"
elif test -e "$path"; then printf 'Unsupported file type\\n' >&2; exit 1
fi`;
      return `entry=$(${kind === 'index' ? "git ls-files --format='%(objectmode) %(objectname)'" : `git ls-tree --format='%(objectmode) %(objectname)' ${shellQuote(snapshot.head)}`} -- "$path")
if test -n "$entry"; then
  set -- $entry
  case "$1" in
    160000) printf 'Subproject commit %s\\n' "$2" ;;
    *) git cat-file blob "$2" ;;
  esac
fi`;
    }
    const parts = await readEncoded(
      guard(snapshot) +
        `command -v iconv > /dev/null\n` +
        setPath(file) +
        `capture ${shellQuote(filePatch(snapshot, mode, file, true))}\n` +
        `stats=$(printf '%s' "$encoded" | base64 -d)
binary=false
case "$stats" in -*) binary=true ;; esac
patch64=''
if test "$binary" = false; then
capture ${shellQuote(filePatch(snapshot, mode, file))}
patch64=$encoded
fi
` +
        `capture ${shellQuote(includeSource ? content(mode === 'untracked' ? 'empty' : mode === 'unstaged' ? 'index' : 'head') : ':')}\nbefore64=$encoded\n` +
        `capture ${shellQuote(includeSource ? content(mode === 'staged' ? 'index' : 'working') : ':')}\nafter64=$encoded\n` +
        (includeSource
          ? `if test "$binary" = false; then
capture ${shellQuote(filePatch(snapshot, mode, file))}
test "$encoded" = "$patch64"
fi
`
          : '') +
        `
for source64 in "$before64" "$after64" "$patch64"; do
  if ! printf '%s' "$source64" | base64 -d | iconv -f UTF-8 -t UTF-8 > /dev/null 2>&1; then binary=true; fi
done
` +
        section(
          `if test "$binary" = false; then printf '%s' "$patch64" | base64 -d | LC_ALL=C awk -v maxchars=${DIFF_LINE_CHARACTERS} -v maxlines=${DIFF_HUNK_LINES} ${shellQuote(previewAwk)}; else printf '{"header":"","hunks":[]}'; fi`,
        ) +
        section('printf "%s" "$binary"') +
        section('printf "%s" "$patch64" | base64 -d | git hash-object --stdin') +
        section(
          includeSource
            ? 'if test "$binary" = false; then printf "%s" "$before64" | base64 -d; fi'
            : ':',
        ) +
        section(
          includeSource
            ? 'if test "$binary" = false; then printf "%s" "$after64" | base64 -d; fi'
            : ':',
        ) +
        guard(snapshot),
      5,
      { signal, timeout: 5000 },
    );
    const preview = JSON.parse(decode(parts[0])) as GitPreview;
    preview.binary = decode(parts[1]) === 'true';
    preview.hash = decode(parts[2]).trim();
    preview.selectable =
      !preview.binary &&
      preview.hunks.length > 0 &&
      !/^(new file|deleted file|old mode|new mode|index .* 160000)/m.test(preview.header);
    return {
      preview,
      before: decode(parts[3]),
      after: decode(parts[4]),
      beforeBase64: parts[3],
      afterBase64: parts[4],
    };
  }

  function preview(snapshot: GitSnapshot, mode: GitDiffMode, file: GitPatch, signal?: AbortSignal) {
    return inspectFile(snapshot, mode, file, false, signal).then((result) => result.preview);
  }

  function source(
    snapshot: GitSnapshot,
    mode: GitDiffMode,
    file: GitPatch,
    signal?: AbortSignal,
  ): Promise<GitSource> {
    return inspectFile(snapshot, mode, file, true, signal);
  }

  async function recentMessages(snapshot: GitSnapshot, signal?: AbortSignal) {
    // An unborn branch has no commit history.
    if (!snapshot.head) return [];
    const [log] = await read(
      section(`test "$(pwd -P)" = ${shellQuote(snapshot.root)}
git --no-pager log -10 --date-order --no-merges --no-show-signature --encoding=UTF-8 --format=format:%B%x00 ${shellQuote(snapshot.head)} --`),
      1,
      { signal, timeout: 5000 },
    );
    const messages: { message: string; truncated: boolean }[] = [];
    let remaining = 12000;
    for (const entry of log.split('\0')) {
      const message = entry.trim();
      if (!message) continue;
      if (!remaining) break;
      const characters = Array.from(message);
      const limit = Math.min(2000, remaining);
      const excerpt = characters.slice(0, limit);
      messages.push({ message: excerpt.join(''), truncated: characters.length > limit });
      remaining -= excerpt.length;
    }
    return messages;
  }

  function guard(snapshot: GitSnapshot) {
    return `test "$(pwd -P)" = ${shellQuote(snapshot.root)}
test "$(git rev-parse --verify -q HEAD || test "$?" = 1)" = ${shellQuote(snapshot.head)}
test "$(git symbolic-ref -q HEAD || test "$?" = 1)" = ${shellQuote(snapshot.branchRef)}
`;
  }

  function fileArguments(snapshot: GitSnapshot, paths: string[]) {
    return (
      'set --\n' +
      paths
        .map((path) => {
          const file = [
            ...snapshot.staged,
            ...snapshot.unstaged,
            ...snapshot.changes,
            ...snapshot.untracked,
          ].find((file) => file.file === path);
          if (!file) throw new Error('Selected file is no longer available.');
          return setPath(file) + 'set -- "$@" "$path"\n';
        })
        .join('')
    );
  }

  async function stage(
    snapshot: GitSnapshot,
    reverse: boolean,
    files: string[],
    patches: GitHunkSelection[],
  ) {
    // Validate and assemble selected hunks before applying them to the index.
    const script =
      SETUP +
      guard(snapshot) +
      `batch=''\n` +
      patches
        .map((selection) => {
          if (
            !/^[0-9a-f]{40,64}$/.test(selection.hash) ||
            !selection.indices.length ||
            new Set(selection.indices).size !== selection.indices.length ||
            selection.indices.some((index) => !Number.isSafeInteger(index) || index < 0)
          )
            throw new Error('Invalid hunk selection.');
          return (
            `capture ${shellQuote(filePatch(snapshot, reverse ? 'staged' : 'unstaged', selection.file))}\npatch64=$encoded\n` +
            `test "$(printf '%s' "$patch64" | base64 -d | git hash-object --stdin)" = ${shellQuote(selection.hash)}\n` +
            `capture ${shellQuote(`printf '%s' "$patch64" | base64 -d | LC_ALL=C awk -v last=${Math.max(...selection.indices) + 1} -v chosen=${shellQuote(',' + selection.indices.map((index) => index + 1).join(',') + ',')} '/^@@ / { hunk++ } !hunk || index(chosen, "," hunk ",") { print } END { if (hunk < last) exit 1 }'`)}\n` +
            `batch=$batch$(printf '%s' "$encoded" | base64 -d; printf '.')\nbatch=\${batch%.}\n`
          );
        })
        .join('') +
      guard(snapshot) +
      (patches.length
        ? `printf '%s' "$batch" | git apply --cached ${reverse ? '--reverse' : ''} --whitespace=nowarn\n`
        : '') +
      fileArguments(snapshot, files) +
      (files.length
        ? reverse
          ? snapshot.head
            ? 'git restore --staged -- "$@"\n'
            : 'git rm --cached -f -- "$@"\n'
          : 'git add -- "$@"\n'
        : '');
    const code = await run(script, reverse ? 'Unstage selected changes' : 'Stage selected changes');
    if (code !== 0) throw new Error('Git staging failed. Refresh before continuing.');
  }

  async function commit(snapshot: GitSnapshot, all: boolean, untracked: string[], message: string) {
    const script =
      SETUP +
      guard(snapshot) +
      fileArguments(snapshot, untracked) +
      (untracked.length ? `git add -- "$@"\n` : '') +
      `printf '%s' ${shellQuote(message)} | git commit ${all ? '-a ' : ''}-F -\n`;
    const code = await run(script, all ? 'git commit -a' : 'git commit');
    if (code !== 0) throw new Error('Git commit failed. Refresh before continuing.');
  }

  return { snapshot, statistics, source, preview, recentMessages, stage, commit };
}

export type GitActions = ReturnType<typeof createGitActions>;
