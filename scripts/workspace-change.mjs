import { execFileSync } from 'node:child_process';

const path = 'src/layout/workspace.json';

export function validateWorkspaceChange(base, head) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const entry = (sha) => git('ls-tree', sha, '--', path).split(/\s+/);
  const previous = entry(base)[2] ?? null;
  const [mode, type, proposed] = entry(head);
  if (previous === (proposed ?? null)) return;
  if (mode !== '100644' || type !== 'blob')
    throw new Error('The published layout must be a regular JSON file');
  const target = head + ':' + path;
  if (Number(git('cat-file', '-s', target)) > 1_000_000)
    throw new Error('The published layout exceeds 1 MB');
  const raw = JSON.parse(git('show', target));
  if (raw?.previousBlobSha !== previous)
    throw new Error('The common layout has changed. Start from the latest published version.');
}
