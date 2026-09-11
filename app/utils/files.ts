import type { FileSystemEntry } from '@opencode-ai/client';
import type { TreeNode } from '../types/files';

export function treeChildren(entries: FileSystemEntry[]): TreeNode[] {
  return entries
    .map((entry) => {
      const path = entry.type === 'directory' ? entry.path.replace(/\/+$/, '') : entry.path;
      return {
        path,
        name: path.slice(path.lastIndexOf('/') + 1),
        type: entry.type,
        loaded: entry.type === 'file',
      };
    })
    .sort(
      (a, b) =>
        Number(b.type === 'directory') - Number(a.type === 'directory') ||
        a.name.localeCompare(b.name),
    );
}

export function findTreeNode(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const child = findTreeNode(node.children, path);
      if (child) return child;
    }
  }
}

export function treeFiles(nodes: TreeNode[]): string[] {
  return nodes
    .filter((node) => !node.ignored)
    .flatMap((node) => (node.type === 'file' ? [node.path] : treeFiles(node.children ?? [])));
}

/** Classify bytes before handing text or binary data to the existing viewer. */
export function fileContent(bytes: Uint8Array) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  const binaryBase64 = btoa(binary);
  if (bytes.includes(0)) return { binaryBase64 };
  try {
    return { binaryBase64, fileContent: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { binaryBase64 };
  }
}
