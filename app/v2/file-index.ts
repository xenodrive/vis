import ignore, { type Ignore } from 'ignore';
import type { FileListOutput } from '@opencode-ai/client';
import type { TreeNode } from '../composables/useFileTree';
import { treeChildren } from './files';

type RuleSet = { directory: string; rules: Ignore };
type Directory = { nodes: TreeNode[]; rules: RuleSet[]; ignored: boolean };
const MAX_DIRECTORIES = 300;
const MAX_ENTRIES = 20000;
const MAX_DEPTH = 12;
const CONCURRENCY = 4;

/** A Location-owned index. Rendering file references never performs a search request. */
export function createFileIndex(options: {
  directory: string;
  signal: AbortSignal;
  list: (path: string) => Promise<FileListOutput>;
  read: (path: string) => Promise<Uint8Array>;
  publish: (path: string, nodes: TreeNode[]) => void;
  report: (error: unknown) => void;
}) {
  const root = options.directory.replace(/\/$/, '');
  const directories = new Map<string, Promise<Directory>>();
  let count = 0;
  let entries = 0;
  let limited = false;

  function absolute(path: string) {
    return path === '.' ? root : `${root}/${path}`;
  }
  async function rulesAt(path: string, listing: FileListOutput, inherited: RuleSet[]) {
    if (
      !listing.data.some(
        (entry) => entry.type === 'file' && entry.path.split('/').at(-1) === '.gitignore',
      )
    )
      return inherited;
    const bytes = await options.read(`${path === '.' ? '' : `${path}/`}.gitignore`);
    options.signal.throwIfAborted();
    return [
      ...inherited,
      {
        directory: path.startsWith('/') ? path : absolute(path),
        rules: ignore({ ignorecase: false }).add(new TextDecoder().decode(bytes)),
      },
    ];
  }
  function ignored(path: string, directory: boolean, rules: RuleSet[]) {
    if (path.split('/').some((part) => part === '.git' || part === 'node_modules')) return true;
    const target = absolute(path);
    let result = false;
    for (const group of rules) {
      if (!target.startsWith(`${group.directory}/`)) continue;
      const relative = target.slice(group.directory.length + 1) + (directory ? '/' : '');
      const match = group.rules.test(relative);
      if (match.ignored) result = true;
      if (match.unignored) result = false;
    }
    return result;
  }
  async function ancestorRules(listing: FileListOutput) {
    const project = listing.location.project.directory.replace(/\/$/, '');
    if (!project || root === project || !root.startsWith(`${project}/`)) return [];
    let rules: RuleSet[] = [];
    let directory = project;
    for (const segment of root.slice(project.length + 1).split('/')) {
      const parent = await options.list(directory);
      rules = await rulesAt(directory, parent, rules);
      directory += `/${segment}`;
    }
    return rules;
  }

  function load(path: string): Promise<Directory> {
    const existing = directories.get(path);
    if (existing) return existing;
    const request = (async () => {
      options.signal.throwIfAborted();
      const listing = await options.list(path);
      options.signal.throwIfAborted();
      let inherited: RuleSet[];
      let parentIgnored = false;
      if (path === '.') {
        inherited = await ancestorRules(listing);
        parentIgnored = ignored('.', true, inherited);
      } else {
        const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
        const info = await load(parent);
        inherited = info.rules;
        parentIgnored = info.ignored || ignored(path, true, inherited);
      }
      const rules = parentIgnored ? inherited : await rulesAt(path, listing, inherited);
      options.signal.throwIfAborted();
      const nodes = treeChildren(listing.data);
      for (const node of nodes)
        node.ignored = parentIgnored || ignored(node.path, node.type === 'directory', rules);
      count++;
      entries += nodes.length;
      options.publish(path, nodes);
      return { nodes, rules, ignored: parentIgnored };
    })();
    directories.set(path, request);
    request.catch(() => {
      directories.delete(path);
    });
    return request;
  }

  async function scan() {
    const queue = [{ path: '.', depth: 0 }];
    while (queue.length) {
      options.signal.throwIfAborted();
      const available = Math.min(CONCURRENCY, MAX_DIRECTORIES - count);
      if (available <= 0 || entries >= MAX_ENTRIES) {
        limited = true;
        break;
      }
      const batch = queue.splice(0, available);
      await Promise.all(
        batch.map(async ({ path, depth }) => {
          try {
            const directory = await load(path);
            const children = directory.nodes.filter(
              (node) => node.type === 'directory' && !node.ignored,
            );
            if (depth >= MAX_DEPTH) {
              if (children.length) limited = true;
              return;
            }
            for (const child of children) queue.push({ path: child.path, depth: depth + 1 });
          } catch (error) {
            if (!options.signal.aborted) options.report(error);
          }
        }),
      );
    }
    return limited;
  }
  return { load, scan };
}
