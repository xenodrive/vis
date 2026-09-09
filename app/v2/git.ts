import type { GitFileStatus, GitStatusCode } from '../components/TreeView.vue';

export type GitAction = 'stage' | 'unstage' | 'commit-staged' | 'commit-all';
export type GitPatch = {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  binary: boolean;
};
export type GitSnapshot = {
  root: string;
  head: string;
  branchRef: string;
  indexTree: string;
  status: Record<string, GitFileStatus>;
  staged: GitPatch[];
  unstaged: GitPatch[];
  changes: GitPatch[];
};

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const DIFF =
  'git -c core.quotePath=false diff --no-ext-diff --no-textconv --no-renames --no-relative --no-color --src-prefix=a/ --dst-prefix=b/ --submodule=short --ignore-submodules=none';
const SETUP = `set -eu
export GIT_LITERAL_PATHSPECS=1
cd "$(git rev-parse --show-toplevel)"
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
`;
const COPY_INDEX = `index=$(git rev-parse --git-path index)
if test -f "$index"; then cp "$index" "$d/index"; else GIT_INDEX_FILE="$d/index" git read-tree --empty; fi
`;
const SEPARATOR = '\nVIS_GIT_SECTION\n';

function section(command: string) {
  return `{ ${command}; } > "$d/output"
base64 < "$d/output"
printf '\\nVIS_GIT_SECTION\\n'
`;
}

function diffSections(args: string) {
  return (
    section(`${DIFF} --numstat -z ${args}`) +
    section(`${DIFF} --binary --full-index --unified=3 --inter-hunk-context=0 ${args}`)
  );
}

function decode(value: string) {
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(atob(value.replaceAll(/\s/g, '')), (char) => char.charCodeAt(0)),
  );
}

export function parsePatches(stats: string, patch: string): GitPatch[] {
  const files = stats.split('\0').filter(Boolean);
  const patches: string[] = [];
  for (const part of patch.split(/(?=^diff --git )/m).filter(Boolean)) {
    // Git emits deletion/addition patches for a type change, but one numstat entry.
    const previous = patches.at(-1);
    if (previous && previous.split('\n', 1)[0] === part.split('\n', 1)[0])
      patches[patches.length - 1] += part;
    else patches.push(part);
  }
  if (files.length !== patches.length) throw new Error('Git diff file counts do not match.');
  return files.map((entry, index) => {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/.exec(entry);
    if (!match) throw new Error('Invalid Git diff statistics.');
    return {
      file: match[3],
      additions: match[1] === '-' ? 0 : Number(match[1]),
      deletions: match[2] === '-' ? 0 : Number(match[2]),
      binary: match[1] === '-',
      patch: patches[index],
    };
  });
}

function parseStatus(text: string): GitSnapshot['status'] {
  const entries = text.split('\0');
  const result: GitSnapshot['status'] = Object.create(null);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const index = entry[0].trim();
    const worktree = entry[1].trim();
    if (![index, worktree].every((code) => ['', 'M', 'A', 'D', 'R', 'C', 'T', '?'].includes(code)))
      throw new Error('Resolve Git conflicts before staging or committing changes.');
    const path = entry.slice(3);
    result[path] = { path, index: index as GitStatusCode, worktree: worktree as GitStatusCode };
    if ([index, worktree].some((code) => code === 'R' || code === 'C'))
      result[path].origPath = entries[++i];
  }
  return result;
}

export function patchHunks(file: GitPatch) {
  // Structural changes must be staged as a whole file.
  if (file.binary || /^(new file|deleted file|old mode|new mode|index .* 160000)/m.test(file.patch))
    return [];
  return file.patch.match(/^@@ .*?(?=^@@ |$(?![\s\S]))/gms) ?? [];
}

export function selectedPatch(file: GitPatch, selected: number[]) {
  const hunks = patchHunks(file);
  const start = file.patch.indexOf('\n@@ ');
  if (!hunks.length || start < 0) throw new Error('This file requires whole-file staging.');
  return file.patch.slice(0, start + 1) + selected.map((index) => hunks[index]).join('');
}

export function createGitActions(
  inspect: (command: string) => Promise<string>,
  run: (command: string, title?: string) => Promise<number | undefined>,
) {
  async function read(script: string, count: number) {
    const output = await inspect(`${SETUP}${script}printf 'VIS_GIT_DONE\\n'`);
    const parts = output.split(SEPARATOR);
    if (parts.length !== count + 1 || parts.at(-1) !== 'VIS_GIT_DONE\n')
      throw new Error(`Git inspection failed: ${output.trim()}`);
    return parts.slice(0, -1).map(decode);
  }

  async function snapshot(untracked: string[] = []): Promise<GitSnapshot> {
    const parts = await read(
      section('pwd -P') +
        section('git rev-parse --verify -q HEAD || test "$?" = 1') +
        COPY_INDEX +
        `export GIT_INDEX_FILE="$d/index"\n` +
        section('git write-tree') +
        section('git status --porcelain=v1 -z --untracked-files=all') +
        diffSections('--cached') +
        diffSections('') +
        `git add -u\n` +
        (untracked.length ? `git add -- ${untracked.map(shellQuote).join(' ')}\n` : '') +
        diffSections('--cached') +
        section('git symbolic-ref -q HEAD || test "$?" = 1'),
      11,
    );
    return {
      root: parts[0].trimEnd(),
      head: parts[1].trim(),
      branchRef: parts[10].trim(),
      indexTree: parts[2].trim(),
      status: parseStatus(parts[3]),
      staged: parsePatches(parts[4], parts[5]),
      unstaged: parsePatches(parts[6], parts[7]),
      changes: parsePatches(parts[8], parts[9]),
    };
  }

  async function untrackedPatch(path: string) {
    const parts = await read(
      COPY_INDEX +
        `export GIT_INDEX_FILE="$d/index"\ngit add -- ${shellQuote(path)}\n` +
        diffSections(`--cached -- ${shellQuote(path)}`),
      2,
    );
    const files = parsePatches(parts[0], parts[1]);
    if (files.length !== 1) throw new Error('The untracked file changed. Refresh and try again.');
    return files[0];
  }

  function guard(snapshot: GitSnapshot) {
    return `test "$(pwd -P)" = ${shellQuote(snapshot.root)}
test "$(git rev-parse --verify -q HEAD || test "$?" = 1)" = ${shellQuote(snapshot.head)}
test "$(git symbolic-ref -q HEAD || test "$?" = 1)" = ${shellQuote(snapshot.branchRef)}
test "$(git write-tree)" = ${shellQuote(snapshot.indexTree)}
`;
  }

  async function stage(
    snapshot: GitSnapshot,
    reverse: boolean,
    files: string[],
    patches: string[],
  ) {
    // Prepare all selections in a separate index, then update the real index atomically via Git.
    const script =
      SETUP +
      guard(snapshot) +
      COPY_INDEX +
      `export GIT_INDEX_FILE="$d/index"\n` +
      (files.length
        ? reverse
          ? snapshot.head
            ? `git restore --staged -- ${files.map(shellQuote).join(' ')}\n`
            : `git rm --cached -f -- ${files.map(shellQuote).join(' ')}\n`
          : `git add -A -- ${files.map(shellQuote).join(' ')}\n`
        : '') +
      (patches.length
        ? `printf '%s' ${shellQuote(patches.join(''))} | git apply --cached ${reverse ? '--reverse' : ''} --whitespace=nowarn\n`
        : '') +
      `tree=$(git write-tree)
unset GIT_INDEX_FILE
${guard(snapshot)}${DIFF} --binary --full-index --unified=3 ${shellQuote(snapshot.indexTree)} "$tree" > "$d/selection.patch"
git apply --cached --whitespace=nowarn "$d/selection.patch"
`;
    const code = await run(script, reverse ? 'Unstage selected changes' : 'Stage selected changes');
    if (code !== 0) throw new Error('Git staging failed. Review the terminal output and refresh.');
  }

  async function commit(snapshot: GitSnapshot, all: boolean, untracked: string[], message: string) {
    const script =
      SETUP +
      guard(snapshot) +
      (untracked.length ? `git add -- ${untracked.map(shellQuote).join(' ')}\n` : '') +
      `printf '%s' ${shellQuote(message)} > "$d/message"\ngit commit ${all ? '-a ' : ''}-F "$d/message"\n`;
    const code = await run(script, all ? 'git commit -a' : 'git commit');
    if (code !== 0) throw new Error('Git commit failed. Review the terminal output and refresh.');
  }

  return { snapshot, untrackedPatch, stage, commit };
}

export type GitActions = ReturnType<typeof createGitActions>;
