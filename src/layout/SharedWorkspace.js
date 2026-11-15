import { loadWorkspace, validateWorkspace } from './WorkspaceStore.js';

export const WORKSPACE_PATH = 'src/layout/workspace.json';
export const MAX_WORKSPACE_BYTES = 1_000_000;
export const ACTIVE_KEY = 'zetflix.active-space.v1';
export const CACHE_KEY = 'zetflix.shared-workspace.v1';
export const PENDING_KEY = 'zetflix.workspace-pending.v1';
export const TOKEN_KEY = 'zetflix.workspace-token.v1';
const LEGACY_DRAFT_KEY = 'zetflix.workspace-draft.v1';

export function validateSharedWorkspace(raw, known, activeId) {
  const spaces = raw?.spaces;
  const selected = spaces?.some?.((space) => space?.id === activeId)
    ? activeId
    : (spaces?.[0]?.id ?? null);
  return validateWorkspace({ version: raw?.version, activeId: selected, spaces }, known);
}

export function serializeWorkspace(state) {
  const text = JSON.stringify({ version: state.version, spaces: state.spaces }, null, 2) + '\n';
  if (new TextEncoder().encode(text).length > MAX_WORKSPACE_BYTES)
    throw new Error('Файл макета больше 1 МБ');
  return text;
}

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const sameLayout = (a, b) => equal(a.spaces, b.spaces);

export class WorkspaceConflict extends Error {
  constructor() {
    super('Коллега изменил ту же часть макета. Скачайте свои правки и продолжите с новым макетом.');
  }
}

function mergeValue(base, local, remote) {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;
  throw new WorkspaceConflict();
}

function mergeById(base, local, remote, key, merge) {
  const index = (items) => new Map(items.map((item) => [item[key], item]));
  const before = index(base);
  const wanted = index(local);
  const latest = index(remote);
  return [...new Set([...latest.keys(), ...wanted.keys()])]
    .map((id) => merge(before.get(id), wanted.get(id), latest.get(id)))
    .filter(Boolean);
}

function overlaps(a, b) {
  return a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function mergeSpace(base, local, remote) {
  if (!base || !local || !remote) return mergeValue(base, local, remote);
  const widgets = mergeById(base.widgets, local.widgets, remote.widgets, 'instanceId', mergeValue);
  const localCards = new Map(local.widgets.map((widget) => [widget.instanceId, widget]));
  const remoteCards = new Map(remote.widgets.map((widget) => [widget.instanceId, widget]));
  for (const [index, card] of widgets.entries()) {
    for (const other of widgets.slice(index + 1)) {
      if (
        overlaps(card, other) &&
        !overlaps(localCards.get(card.instanceId), localCards.get(other.instanceId)) &&
        !overlaps(remoteCards.get(card.instanceId), remoteCards.get(other.instanceId))
      )
        throw new WorkspaceConflict();
    }
  }
  return { id: base.id, title: mergeValue(base.title, local.title, remote.title), widgets };
}

export function mergeWorkspace(base, local, remote, known) {
  const spaces = mergeById(base.spaces, local.spaces, remote.spaces, 'id', mergeSpace);
  return validateSharedWorkspace({ version: remote.version, spaces }, known, local.activeId);
}

export function recoverLegacyWorkspace(fallback, known, storage) {
  try {
    const draft = storage?.getItem(LEGACY_DRAFT_KEY);
    const old = draft
      ? validateWorkspace(JSON.parse(draft).state, known)
      : loadWorkspace(fallback, known, storage).state;
    return sameLayout(old, fallback) ? null : old;
  } catch {
    return null;
  }
}
