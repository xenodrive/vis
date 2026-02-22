import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { FileWatcherUpdatedPacket } from '../types/sse';
import * as opencodeApi from '../utils/opencode';
import { usePtyOneshot } from './usePtyOneshot';

const GIT_STATUS_SCRIPT = [
  'stty -opost -echo 2>/dev/null',
  'export GIT_PAGER=cat',
  'export GIT_TERMINAL_PROMPT=0',
  'export NO_COLOR=1',
  'export GIT_CONFIG_NOSYSTEM=1',
  'export TERM=dumb',
  'git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0',
  'git -c color.status=false -c color.ui=false --no-pager status --porcelain=v1 -sb 2>/dev/null',
  'printf "##HEAD\\n"',
  'git rev-parse --short HEAD 2>/dev/null',
  'printf "##DIFFSTAT\\n"',
  'git diff --shortstat 2>/dev/null',
  'printf "##DIFFSTAT_CACHED\\n"',
  'git diff --cached --shortstat 2>/dev/null',
].join('\n');

export type TreeNode = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: TreeNode[];
  loaded?: boolean;
  ignored?: boolean;
  synthetic?: boolean;
};

export type FileNode = {
  name?: string;
  path: string;
  type?: string;
  ignored?: boolean;
};

export type GitStatusCode = '' | 'M' | 'A' | 'D' | 'R' | 'C' | '?';

export type GitFileStatus = {
  path: string;
  index: GitStatusCode;
  worktree: GitStatusCode;
  origPath?: string;
};

export type GitBranchInfo = {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  headShort?: string;
};

export type GitDiffStatsEntry = {
  additions: number;
  deletions: number;
};

export type GitDiffStats = {
  staged: GitDiffStatsEntry;
  unstaged: GitDiffStatsEntry;
};

export type GitStatus = {
  branch: GitBranchInfo;
  files: GitFileStatus[];
  diffStats: GitDiffStats;
};

type UseFileTreeOptions = {
  activeDirectory: Ref<string>;
};

let boundOptions: UseFileTreeOptions | null = null;

const treeNodes = ref<TreeNode[]>([]);
const expandedTreePathSet = ref(new Set<string>());
const selectedTreePath = ref('');
const treeLoading = ref(false);
const treeError = ref('');
const gitStatus = ref<GitStatus | null>(null);
const gitStatusByPath = ref<Record<string, GitFileStatus>>({});
const files = ref<string[]>([]);
const fileCacheVersion = ref(0);

let fileCacheBuildId = 0;
const DIRECTORY_RELOAD_DEBOUNCE_MS = 120;
const GIT_STATUS_RELOAD_DEBOUNCE_MS = 120;
const scheduledDirectoryReloads = new Map<string, ReturnType<typeof setTimeout>>();
let scheduledGitStatusReload: ReturnType<typeof setTimeout> | null = null;
let gitStatusGeneration = 0;

function getOptions(): UseFileTreeOptions {
  if (!boundOptions) {
    throw new Error('useFileTree must be initialized with options before use');
  }
  return boundOptions;
}

function normalizeDirectory(value: string) {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed || value;
}

function normalizeRelativePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '.') return '.';
  const withoutPrefix = trimmed
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/^(\.\.\/)+/, '');
  const normalized = withoutPrefix.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '.';
}

function toRelativePath(path: string, directory: string) {
  const normalizedDirectory = normalizeDirectory(directory);
  const normalizedPath = normalizeDirectory(path);
  if (normalizedPath === normalizedDirectory) return '.';
  const prefix = `${normalizedDirectory}/`;
  if (normalizedPath.startsWith(prefix)) {
    return normalizeRelativePath(normalizedPath.slice(prefix.length));
  }
  return normalizeRelativePath(normalizedPath);
}

function normalizeFileNode(item: unknown, directory: string): FileNode | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const rawPath =
    (typeof record.path === 'string' && record.path) ||
    (typeof record.name === 'string' && record.name) ||
    undefined;
  if (!rawPath) return null;
  const path = toRelativePath(rawPath, directory);
  const name =
    (typeof record.name === 'string' && record.name) ||
    (path === '.' ? '.' : path.split('/').at(-1)) ||
    path;
  const rawType = typeof record.type === 'string' ? record.type.toLowerCase() : '';
  const type = rawType.includes('dir') ? 'directory' : 'file';
  const ignored = Boolean(record.ignored);
  return { path, name, type, ignored };
}

function sortTreeNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

function buildTreeNodes(items: unknown[], directory: string, parentPath: string) {
  const unique = new Map<string, TreeNode>();
  items.forEach((item) => {
    const node = normalizeFileNode(item, directory);
    if (!node) return;
    if (node.path === parentPath || node.path === '.') return;
    const relativeToParent =
      parentPath === '.'
        ? node.path
        : node.path.startsWith(`${parentPath}/`)
          ? node.path.slice(parentPath.length + 1)
          : node.path.includes('/')
            ? ''
            : node.path;
    if (!relativeToParent) return;
    const name = relativeToParent.split('/')[0];
    const path = parentPath === '.' ? name : `${parentPath}/${name}`;
    const isLeaf = !relativeToParent.includes('/');
    const existing = unique.get(path);
    if (existing) {
      if (existing.type === 'file' && !isLeaf) {
        existing.type = 'directory';
        existing.children = [];
      }
      if (node.ignored) existing.ignored = true;
      return;
    }
    const normalizedType: TreeNode['type'] = node.type === 'directory' ? 'directory' : 'file';
    unique.set(path, {
      name,
      path,
      type: isLeaf ? normalizedType : 'directory',
      children: isLeaf && normalizedType !== 'directory' ? undefined : [],
      loaded: false,
      ignored: Boolean(node.ignored),
      synthetic: false,
    });
  });
  return sortTreeNodes(Array.from(unique.values()));
}

function updateTreeNodeChildren(
  nodes: TreeNode[],
  targetPath: string,
  children: TreeNode[],
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return {
        ...node,
        type: 'directory',
        children,
        loaded: true,
      };
    }
    if (node.children?.length) {
      return { ...node, children: updateTreeNodeChildren(node.children, targetPath, children) };
    }
    return node;
  });
}

function findTreeNodeByPath(nodes: TreeNode[], targetPath: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (!node.children?.length) continue;
    const child = findTreeNodeByPath(node.children, targetPath);
    if (child) return child;
  }
  return null;
}

function clearScheduledDirectoryReloads() {
  scheduledDirectoryReloads.forEach((timer) => clearTimeout(timer));
  scheduledDirectoryReloads.clear();
}

function clearScheduledGitStatusReload() {
  if (!scheduledGitStatusReload) return;
  clearTimeout(scheduledGitStatusReload);
  scheduledGitStatusReload = null;
}

function isPathInsideDirectory(path: string, directory: string) {
  const normalizedDirectory = normalizeDirectory(directory);
  const normalizedPath = normalizeDirectory(path);
  if (!normalizedDirectory || !normalizedPath) return false;
  return (
    normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
  );
}

function parentDirectoryPath(relativePath: string) {
  if (!relativePath.includes('/')) return '.';
  return relativePath.slice(0, relativePath.lastIndexOf('/')) || '.';
}

function mergeTreeNodeChildren(existing: TreeNode[], incoming: TreeNode[]) {
  if (existing.length === 0 || incoming.length === 0) return incoming;
  const existingByPath = new Map(existing.map((node) => [node.path, node]));
  return incoming.map((node) => {
    const previous = existingByPath.get(node.path);
    if (
      node.type === 'directory' &&
      previous?.type === 'directory' &&
      previous.loaded &&
      Array.isArray(previous.children)
    ) {
      return {
        ...node,
        children: previous.children,
        loaded: true,
      };
    }
    return node;
  });
}

function replaceDirectoryFilesInCache(parentPath: string, children: TreeNode[]) {
  const directFiles = children.filter((node) => node.type === 'file').map((node) => node.path);
  const preserved = files.value.filter((filePath) => {
    if (parentPath === '.') {
      return filePath.includes('/');
    }
    const prefix = `${parentPath}/`;
    if (!filePath.startsWith(prefix)) return true;
    return filePath.slice(prefix.length).includes('/');
  });
  const next = Array.from(new Set([...preserved, ...directFiles])).sort((a, b) =>
    a.localeCompare(b),
  );
  const changed =
    next.length !== files.value.length || next.some((path, index) => path !== files.value[index]);
  if (!changed) return;
  files.value = next;
  fileCacheVersion.value += 1;
}

function scheduleDirectoryReload(path: string) {
  const timer = scheduledDirectoryReloads.get(path);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  scheduledDirectoryReloads.set(
    path,
    setTimeout(() => {
      scheduledDirectoryReloads.delete(path);
      void loadSingleDirectory(path);
    }, DIRECTORY_RELOAD_DEBOUNCE_MS),
  );
}

function scheduleGitStatusReload() {
  clearScheduledGitStatusReload();
  scheduledGitStatusReload = setTimeout(() => {
    scheduledGitStatusReload = null;
    void refreshGitStatus();
  }, GIT_STATUS_RELOAD_DEBOUNCE_MS);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeGitStatusCode(value: string): GitStatusCode {
  if (value === ' ') return '';
  if (value === '?') return '?';
  if (value === 'M') return 'M';
  if (value === 'A') return 'A';
  if (value === 'D') return 'D';
  if (value === 'R') return 'R';
  if (value === 'C') return 'C';
  return '';
}

function parseGitStatusBranch(line: string): GitBranchInfo {
  const raw = line.replace(/^##\s*/, '').trim();
  let ahead = 0;
  let behind = 0;
  let branchPart = raw;

  const markerStart = raw.indexOf(' [');
  if (markerStart >= 0 && raw.endsWith(']')) {
    branchPart = raw.slice(0, markerStart);
    const marker = raw.slice(markerStart + 2, -1);
    const aheadMatch = marker.match(/ahead\s+(\d+)/);
    const behindMatch = marker.match(/behind\s+(\d+)/);
    ahead = aheadMatch ? Number.parseInt(aheadMatch[1], 10) || 0 : 0;
    behind = behindMatch ? Number.parseInt(behindMatch[1], 10) || 0 : 0;
  }

  const divergenceIndex = branchPart.indexOf('...');
  if (divergenceIndex < 0) {
    return {
      branch: branchPart || '(detached)',
      ahead,
      behind,
    };
  }

  const branch = branchPart.slice(0, divergenceIndex).trim() || '(detached)';
  const upstream = branchPart.slice(divergenceIndex + 3).trim();
  return {
    branch,
    upstream: upstream || undefined,
    ahead,
    behind,
  };
}

function stripAnsi(value: string) {
  const ansiPattern = new RegExp(`${String.raw`\u001b`}\\[[0-?]*[ -/]*[@-~]`, 'g');
  return value.replace(ansiPattern, '');
}

function parseShortstatLine(line: string): { additions: number; deletions: number } {
  const addMatch = line.match(/(\d+)\s+insertion/);
  const delMatch = line.match(/(\d+)\s+deletion/);
  return {
    additions: addMatch ? Number.parseInt(addMatch[1], 10) || 0 : 0,
    deletions: delMatch ? Number.parseInt(delMatch[1], 10) || 0 : 0,
  };
}

function parseGitStatusOutput(output: string): GitStatus {
  const rawLines = output.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    const cleanLine = stripAnsi(line).replace(/\r/g, '');
    if (!cleanLine) continue;
    lines.push(cleanLine);
  }

  let branch: GitBranchInfo = {
    branch: '(detached)',
    ahead: 0,
    behind: 0,
  };
  const entries: GitFileStatus[] = [];
  let section: 'status' | 'head' | 'diffstat' | 'diffstat_cached' = 'status';
  let headShort = '';
  let unstagedAdditions = 0;
  let unstagedDeletions = 0;
  let stagedAdditions = 0;
  let stagedDeletions = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (line === '##HEAD') {
      section = 'head';
      continue;
    }
    if (line === '##DIFFSTAT') {
      section = 'diffstat';
      continue;
    }
    if (line === '##DIFFSTAT_CACHED') {
      section = 'diffstat_cached';
      continue;
    }

    if (section === 'head') {
      if (!headShort && /^[0-9a-f]+$/i.test(line)) {
        headShort = line;
      }
      continue;
    }

    if (section === 'diffstat') {
      const stat = parseShortstatLine(line);
      unstagedAdditions += stat.additions;
      unstagedDeletions += stat.deletions;
      continue;
    }

    if (section === 'diffstat_cached') {
      const stat = parseShortstatLine(line);
      stagedAdditions += stat.additions;
      stagedDeletions += stat.deletions;
      continue;
    }

    const branchMarkerIndex = line.indexOf('## ');
    if (branchMarkerIndex >= 0) {
      branch = parseGitStatusBranch(line.slice(branchMarkerIndex));
      continue;
    }
    const statusMatch = line.match(/([ MADRC?])([ MADRC?]) (.+)$/);
    if (!statusMatch) continue;

    const x = normalizeGitStatusCode(statusMatch[1] ?? '');
    const y = normalizeGitStatusCode(statusMatch[2] ?? '');
    const rest = statusMatch[3] ?? '';
    if (!rest) continue;

    const arrowIndex = rest.indexOf(' -> ');
    if ((x === 'R' || x === 'C') && arrowIndex >= 0) {
      const origPath = rest.slice(0, arrowIndex);
      const newPath = rest.slice(arrowIndex + 4);
      entries.push({
        path: newPath,
        index: x,
        worktree: y,
        origPath,
      });
      continue;
    }

    entries.push({
      path: rest,
      index: x,
      worktree: y,
    });
  }

  if (headShort) {
    branch.headShort = headShort;
  }

  return {
    branch,
    files: entries,
    diffStats: {
      staged: { additions: stagedAdditions, deletions: stagedDeletions },
      unstaged: { additions: unstagedAdditions, deletions: unstagedDeletions },
    },
  };
}

function setGitStatus(next: GitStatus | null) {
  gitStatus.value = next;
  if (!next) {
    gitStatusByPath.value = {};
    return;
  }
  const byPath: Record<string, GitFileStatus> = {};
  next.files.forEach((entry) => {
    byPath[entry.path] = entry;
  });
  gitStatusByPath.value = byPath;
}

async function refreshGitStatus() {
  const { activeDirectory } = getOptions();
  const directory = activeDirectory.value.trim();
  if (!directory) {
    setGitStatus(null);
    return;
  }

  const generation = ++gitStatusGeneration;
  const { runOneShotPtyCommand } = usePtyOneshot();
  try {
    const output = await runOneShotPtyCommand('bash', [
      '--noprofile',
      '--norc',
      '-c',
      GIT_STATUS_SCRIPT,
    ]);
    if (generation !== gitStatusGeneration) return;
    if (!output.includes('##HEAD')) {
      setGitStatus(null);
      return;
    }
    const parsed = parseGitStatusOutput(output);
    const filesByPath = new Map(parsed.files.map((entry) => [entry.path, entry]));
    parsed.files = Array.from(filesByPath.values()).sort((a, b) => a.path.localeCompare(b.path));
    setGitStatus(parsed);
  } catch {
    if (generation !== gitStatusGeneration) return;
    setGitStatus(null);
  }
}

function toggleTreeDirectory(path: string) {
  const next = new Set(expandedTreePathSet.value);
  if (next.has(path)) {
    next.delete(path);
    expandedTreePathSet.value = next;
    return;
  }
  next.add(path);
  expandedTreePathSet.value = next;
  const node = findTreeNodeByPath(treeNodes.value, path);
  if (node?.loaded) return;
  void loadSingleDirectory(path);
}

function selectTreeFile(path: string) {
  selectedTreePath.value = path;
}

const expandedTreePaths = computed(() => Array.from(expandedTreePathSet.value));

async function loadSingleDirectory(path: string) {
  const options = getOptions();
  const directory = options.activeDirectory.value.trim();
  if (!directory) return;
  try {
    const data = await opencodeApi.listFiles({ directory, path });
    if (options.activeDirectory.value.trim() !== directory) return;
    const list = Array.isArray(data) ? data : [];
    const children = buildTreeNodes(list, directory, path);
    if (path === '.') {
      const mergedRootNodes = mergeTreeNodeChildren(treeNodes.value, children);
      treeNodes.value = mergedRootNodes;
      replaceDirectoryFilesInCache(path, mergedRootNodes);
      return;
    }

    const parent = findTreeNodeByPath(treeNodes.value, path);
    const mergedChildren = mergeTreeNodeChildren(parent?.children ?? [], children);
    treeNodes.value = updateTreeNodeChildren(treeNodes.value, path, mergedChildren);
    replaceDirectoryFilesInCache(path, mergedChildren);
  } catch (error) {
    void error;
  }
}

function feed(packet: FileWatcherUpdatedPacket) {
  const options = getOptions();
  const directory = options.activeDirectory.value.trim();
  if (!directory) return;
  if (!isPathInsideDirectory(packet.file, directory)) return;
  if (treeLoading.value) return;

  const relativePath = toRelativePath(packet.file, directory);
  if (relativePath === '.') return;

  if (packet.event === 'unlink') {
    const next = files.value.filter(
      (path) => path !== relativePath && !path.startsWith(`${relativePath}/`),
    );
    if (next.length !== files.value.length) {
      files.value = next;
      fileCacheVersion.value += 1;
    }
  }

  if (packet.event !== 'change') {
    scheduleDirectoryReload(parentDirectoryPath(relativePath));
  }
  scheduleGitStatusReload();
}

async function rebuildFileCache() {
  const options = getOptions();
  const directory = options.activeDirectory.value.trim();
  const buildId = ++fileCacheBuildId;
  treeLoading.value = true;
  treeError.value = '';
  if (!directory) {
    treeNodes.value = [];
    files.value = [];
    fileCacheVersion.value += 1;
    treeLoading.value = false;
    return;
  }

  const AUTO_SCAN_FILE_LIMIT = 1000;
  const queue: string[] = ['.'];
  const visited = new Set<string>();
  const collected: string[] = [];

  try {
    while (queue.length > 0) {
      const path = queue.shift();
      if (!path || visited.has(path)) continue;
      visited.add(path);

      const data = await opencodeApi.listFiles({ directory, path });
      if (buildId !== fileCacheBuildId) return;
      if (options.activeDirectory.value.trim() !== directory) return;

      const list = Array.isArray(data) ? data : [];
      const children = buildTreeNodes(list, directory, path);
      if (path === '.') {
        treeNodes.value = children;
      } else {
        treeNodes.value = updateTreeNodeChildren(treeNodes.value, path, children);
      }

      for (const child of children) {
        if (child.type === 'file') {
          collected.push(child.path);
          continue;
        }
        if (!child.ignored && !visited.has(child.path)) {
          queue.push(child.path);
        }
      }

      if (collected.length > AUTO_SCAN_FILE_LIMIT) break;
    }

    if (buildId !== fileCacheBuildId) return;
    if (options.activeDirectory.value.trim() !== directory) return;
    files.value = Array.from(new Set(collected)).sort((a, b) => a.localeCompare(b));
    fileCacheVersion.value += 1;
  } catch (error) {
    if (buildId !== fileCacheBuildId) return;
    if (options.activeDirectory.value.trim() !== directory) return;
    treeError.value = `Tree load failed: ${toErrorMessage(error)}`;
  } finally {
    if (buildId === fileCacheBuildId && options.activeDirectory.value.trim() === directory) {
      treeLoading.value = false;
    }
  }
}

async function reloadTree() {
  await rebuildFileCache();
}

function initializeFileTree(options: UseFileTreeOptions) {
  if (boundOptions) return;
  boundOptions = options;
  usePtyOneshot({ activeDirectory: options.activeDirectory });
  watch(
    () => options.activeDirectory.value,
    (directory) => {
      clearScheduledDirectoryReloads();
      clearScheduledGitStatusReload();
      const activePath = directory.trim();
      if (!activePath) {
        treeNodes.value = [];
        expandedTreePathSet.value = new Set();
        selectedTreePath.value = '';
        treeError.value = '';
        treeLoading.value = false;
        files.value = [];
        fileCacheVersion.value += 1;
        setGitStatus(null);
        return;
      }
      void reloadTree();
      void refreshGitStatus();
    },
    { immediate: true },
  );
}

export function useFileTree(options?: UseFileTreeOptions) {
  if (options) initializeFileTree(options);
  if (!boundOptions) {
    throw new Error('useFileTree is not initialized');
  }

  return {
    treeNodes,
    expandedTreePaths,
    expandedTreePathSet,
    selectedTreePath,
    treeLoading,
    treeError,
    gitStatus,
    gitStatusByPath,
    files,
    fileCacheVersion,
    reloadTree,
    refreshGitStatus,
    toggleTreeDirectory,
    selectTreeFile,
    feed,
  };
}
