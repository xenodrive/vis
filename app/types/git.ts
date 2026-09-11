export type GitStatusCode = '' | 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | '?';

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
  untracked?: number;
  additions: number;
  deletions: number;
};

export type GitDiffStats = {
  staged: GitDiffStatsEntry;
  unstaged: GitDiffStatsEntry;
  changes: GitDiffStatsEntry;
};

export type BranchEntry = {
  refname: string;
  refnameShort: string;
  displayName: string;
  hash: string;
  subject: string;
  isCurrent: boolean;
  isWorktree: boolean;
  isLocal: boolean;
  remote: string;
  upstream: string;
  hasLocalCounterpart: boolean;
};
