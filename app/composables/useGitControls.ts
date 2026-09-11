import { ref, watch, onBeforeUnmount } from 'vue';
import type { useSessionState } from './useSessionState';
import type { BranchEntry, GitBranchInfo } from '../types/git';

const INSPECT = `git status --porcelain=v2 --branch --untracked-files=no && printf '\\nVIS_REFS\\n' && git for-each-ref --format='%(refname)%09%(refname:short)%09%(objectname)%09%(subject)%09%(HEAD)%09%(worktreepath)%09%(upstream:short)' refs/heads refs/remotes && printf '\\nVIS_GIT_OK\\n'`;

export function useGitControls(
  state: ReturnType<typeof useSessionState>,
  reloadFiles: () => Promise<void>,
) {
  const branch = ref<GitBranchInfo | null>(null);
  const entries = ref<BranchEntry[]>([]);
  const loading = ref(false);
  let revision = 0;
  async function reload() {
    const request = ++revision;
    loading.value = true;
    try {
      const text = await state.runGitCommand(INSPECT);
      if (request !== revision) return;
      if (!text.endsWith('VIS_GIT_OK\n'))
        throw new Error(
          `Git inspection failed (completion marker missing, ${text.length} output characters): ${text.trim()}`,
        );
      const [status, refs] = text.split('\nVIS_REFS\n');
      const head = /^# branch.head (.+)$/m.exec(status)?.[1];
      const upstream = /^# branch.upstream (.+)$/m.exec(status)?.[1];
      const counts = /^# branch.ab \+(\d+) -(\d+)$/m.exec(status);
      branch.value = head
        ? {
            branch: head,
            upstream,
            ahead: counts ? Number(counts[1]) : 0,
            behind: counts ? Number(counts[2]) : 0,
          }
        : null;
      const parsed = refs
        .split('\n')
        .filter((line) => line.startsWith('refs/'))
        .map((line) => {
          const [refname, refnameShort, hash, subject, current, worktree, upstream] =
            line.split('\t');
          const isLocal = refname.startsWith('refs/heads/');
          const remote = isLocal ? '' : refname.slice('refs/remotes/'.length).split('/')[0];
          return {
            refname,
            refnameShort,
            displayName: isLocal ? refname.slice('refs/heads/'.length) : refnameShort,
            hash,
            subject,
            isCurrent: current === '*',
            isWorktree: !!worktree,
            isLocal,
            remote,
            upstream,
            hasLocalCounterpart: false,
          };
        });
      const locals = new Set(
        parsed.filter((entry) => entry.isLocal).map((entry) => entry.displayName),
      );
      entries.value = parsed.map((entry) => ({
        ...entry,
        hasLocalCounterpart:
          !entry.isLocal && locals.has(entry.refname.slice(`refs/remotes/${entry.remote}/`.length)),
      }));
    } catch (cause) {
      if (request === revision)
        state.error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (request === revision) loading.value = false;
    }
  }
  async function run(command: string) {
    const location = state.selected.value?.location;
    try {
      await state.runGitCommand(command, 'Git command');
      if (location === state.selected.value?.location) await reloadFiles();
    } catch (cause) {
      state.error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }
  watch(
    () => JSON.stringify(state.selected.value?.location),
    () => {
      revision++;
      branch.value = null;
      entries.value = [];
    },
  );
  onBeforeUnmount(() => {
    revision++;
  });
  return { branch, entries, loading, reload, run };
}
