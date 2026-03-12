import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { useV2 } from './useV2';
import type { useFloatingWindows } from './useFloatingWindows';
import type { TreeNode, GitFileStatus, GitBranchInfo, GitDiffStats } from './useFileTree';
import WorkingDiff from '../components/v2/WorkingDiff.vue';
import ContentViewer from '../components/viewers/ContentViewer.vue';
import { guessLanguageFromPath } from '../components/ToolWindow/utils';
import hexdump from '@kikuchan/hexdump';
import { errorMessage } from '../v2/connection';
import { fileContent, findTreeNode, treeFiles } from '../v2/files';
import { createFileIndex } from '../v2/file-index';

export function useV2FileTree(
  state: ReturnType<typeof useV2>,
  fw: ReturnType<typeof useFloatingWindows>,
) {
  const nodes = ref<TreeNode[]>([]);
  const expanded = ref<string[]>([]);
  const selectedPath = ref<string>();
  const loading = ref(false);
  const error = ref('');
  const gitError = ref('');
  const gitStatus = ref<Record<string, GitFileStatus>>({});
  const branch = ref<GitBranchInfo | null>(null);
  const diffStats = ref<GitDiffStats | null>(null);
  const version = ref(0);
  const files = ref<string[]>([]);
  const scanning = ref(false);
  const indexNote = ref('');
  const scope = computed(() => state.selected.value?.location);
  const pending = new Set<string>();
  const reads = new Map<string, AbortController>();
  let controller = new AbortController();
  let generation = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let publishTimer: ReturnType<typeof setTimeout> | undefined;
  let index: ReturnType<typeof createFileIndex> | undefined;

  function publishFiles() {
    clearTimeout(publishTimer);
    publishTimer = undefined;
    files.value = treeFiles(nodes.value);
    version.value++;
  }

  function fileIndex() {
    if (index) return index;
    const location = scope.value;
    if (!location) throw new Error('Select a session before loading files.');
    const current = generation;
    const signal = controller.signal;
    index = createFileIndex({
      directory: location.directory,
      signal,
      list: (path) => state.listFiles(location, path, signal),
      read: (path) => state.readFile(location, path, signal),
      report: (cause) => {
        if (current === generation) error.value = errorMessage(cause);
      },
      publish: (path, children) => {
        if (current !== generation) return;
        if (path === '.') nodes.value = children;
        else {
          const node = findTreeNode(nodes.value, path);
          if (!node) return;
          node.children = children;
          node.loaded = true;
        }
        if (!publishTimer) publishTimer = setTimeout(publishFiles, 200);
      },
    });
    return index;
  }

  async function preload() {
    if (!scope.value) return;
    const current = generation;
    scanning.value = true;
    try {
      const limited = await fileIndex().scan();
      if (current === generation && limited)
        indexNote.value = 'Automatic file indexing limit reached. Expand directories to load more.';
    } catch (cause) {
      if (current === generation) error.value = errorMessage(cause);
    } finally {
      if (current === generation) {
        scanning.value = false;
        publishFiles();
      }
    }
  }

  async function loadGit() {
    const location = scope.value;
    if (!location) return;
    const current = generation;
    try {
      const result = await state.readVcs(location, controller.signal);
      if (current !== generation) return;
      gitError.value = '';
      branch.value = result.info.branch.current
        ? { branch: result.info.branch.current, ahead: 0, behind: 0 }
        : null;
      gitStatus.value = Object.fromEntries(
        result.status.map((file) => [
          file.file,
          {
            path: file.file,
            index: '',
            worktree: file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M',
          },
        ]),
      );
      diffStats.value = {
        staged: { additions: 0, deletions: 0 },
        unstaged: {
          additions: result.status.reduce((sum, file) => sum + file.additions, 0),
          deletions: result.status.reduce((sum, file) => sum + file.deletions, 0),
        },
      };
    } catch (cause) {
      if (current === generation) gitError.value = errorMessage(cause);
    }
  }

  async function openDiff(path?: string) {
    const location = scope.value;
    if (!location) return;
    const current = generation;
    try {
      const changes = await state.readWorkingDiff(location, controller.signal);
      if (current !== generation) return;
      const files = path ? changes.filter((file) => file.file === path) : changes;
      if (!files.length) {
        state.error.value = 'No working-copy diff is available for this selection.';
        return;
      }
      await fw.open(`working-diff:${JSON.stringify(location)}:${path ?? 'all'}`, {
        component: WorkingDiff,
        props: { files },
        title: path ? `Changes: ${path}` : 'All uncommitted changes',
        variant: 'diff',
        closable: true,
        resizable: true,
        focusOnOpen: true,
        scroll: 'manual',
        expiry: Infinity,
        width: 900,
        height: 650,
      });
    } catch (cause) {
      if (current === generation) state.error.value = errorMessage(cause);
    }
  }

  async function load(path: string) {
    const location = scope.value;
    if (!location || pending.has(path)) return;
    const current = generation;
    pending.add(path);
    loading.value = true;
    error.value = '';
    try {
      await fileIndex().load(path);
    } catch (cause) {
      if (current === generation) error.value = errorMessage(cause);
    } finally {
      if (current === generation) {
        pending.delete(path);
        loading.value = pending.size > 0;
      }
    }
  }

  async function toggle(path: string) {
    if (expanded.value.includes(path)) {
      expanded.value = expanded.value.filter((value) => value !== path);
      return;
    }
    expanded.value.push(path);
    if (!findTreeNode(nodes.value, path)?.loaded) await load(path);
  }

  function reset() {
    generation++;
    controller.abort();
    controller = new AbortController();
    index = undefined;
    clearTimeout(publishTimer);
    publishTimer = undefined;
    files.value = [];
    scanning.value = false;
    indexNote.value = '';
    for (const read of reads.values()) read.abort();
    reads.clear();
    pending.clear();
    nodes.value = [];
    loading.value = false;
    error.value = '';
    gitError.value = '';
    gitStatus.value = {};
    branch.value = null;
    diffStats.value = null;
    version.value++;
  }

  async function reload() {
    const paths = [...expanded.value].sort((a, b) => a.split('/').length - b.split('/').length);
    reset();
    const current = generation;
    await Promise.all([preload(), loadGit()]);
    for (const path of paths) {
      if (current !== generation) return;
      if (findTreeNode(nodes.value, path)?.type === 'directory') await load(path);
    }
    if (current === generation)
      expanded.value = paths.filter((path) => !!findTreeNode(nodes.value, path));
  }

  async function openFile(path: string, lines?: string) {
    const location = scope.value;
    if (!location) return;
    selectedPath.value = path;
    const current = generation;
    const key = `file-viewer:${JSON.stringify(location)}:${path}:${lines ?? ''}`;
    reads.get(key)?.abort();
    const request = new AbortController();
    reads.set(key, request);
    try {
      const bytes = await state.readFile(location, path, request.signal);
      if (current !== generation || request.signal.aborted) return;
      const content = fileContent(bytes);
      const rawHtml =
        content.fileContent === undefined
          ? `<pre class="shiki"><code>${hexdump(bytes, { color: 'html' })}</code></pre>`
          : undefined;
      await fw.open(key, {
        component: ContentViewer,
        props: {
          path,
          ...content,
          rawHtml,
          lines,
          lang: guessLanguageFromPath(path),
          theme: 'github-dark',
        },
        title: path,
        variant: 'plain',
        width: 800,
        height: 600,
        closable: true,
        resizable: true,
        focusOnOpen: true,
        scroll: 'manual',
        expiry: Infinity,
      });
    } catch (cause) {
      if (current === generation && !request.signal.aborted) {
        error.value = errorMessage(cause);
        state.error.value = error.value;
      }
    } finally {
      if (reads.get(key) === request) reads.delete(key);
    }
  }

  watch(
    () => JSON.stringify([state.ready.value, scope.value]),
    () => {
      for (const entry of fw.entries.value) {
        if (entry.key.startsWith('file-viewer:') || entry.key.startsWith('working-diff:'))
          void fw.close(entry.key);
      }
      reset();
      expanded.value = [];
      selectedPath.value = undefined;
      clearTimeout(refreshTimer);
      if (state.ready.value && scope.value) {
        void preload();
        void loadGit();
      }
    },
    { immediate: true },
  );

  const stopEvents = state.onEvent((event) => {
    if (!['filesystem.changed', 'vcs.branch.updated'].includes(event.type)) return;
    if (
      !event.location ||
      event.location.directory !== scope.value?.directory ||
      event.location.workspaceID !== scope.value?.workspaceID
    )
      return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      void reload();
    }, 500);
  });

  onBeforeUnmount(() => {
    stopEvents();
    clearTimeout(refreshTimer);
    controller.abort();
    clearTimeout(publishTimer);
    for (const read of reads.values()) read.abort();
  });
  return {
    nodes,
    expanded,
    selectedPath,
    loading: computed(() => loading.value || scanning.value),
    error: computed(() =>
      [error.value, gitError.value, indexNote.value].filter(Boolean).join('\n'),
    ),
    gitStatus,
    branch,
    diffStats,
    openDiff,
    files,
    version,
    toggle,
    reload,
    openFile,
  };
}
