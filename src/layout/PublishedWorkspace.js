import { loadWorkspace, validateWorkspace } from './WorkspaceStore.js';

export const WORKSPACE_PATH = 'src/layout/workspace.json';
export const DRAFT_KEY = 'zetflix.workspace-draft.v1';
export const ACTIVE_KEY = 'zetflix.active-space.v1';
export const SHA = /^[0-9a-f]{40}$/;
export const MAX_WORKSPACE_BYTES = 1_000_000;
const encoder = new TextEncoder();

export function validatePublishedWorkspace(raw, known, activeId) {
  if (
    !raw ||
    !Array.isArray(raw.spaces) ||
    !(raw.previousBlobSha === null || SHA.test(raw.previousBlobSha ?? ''))
  )
    throw new Error('Некорректная версия общего макета');
  const selected = raw.spaces.some((space) => space?.id === activeId)
    ? activeId
    : (raw.spaces[0]?.id ?? null);
  return validateWorkspace({ version: raw.version, activeId: selected, spaces: raw.spaces }, known);
}

export function serializeWorkspace(state, previousBlobSha) {
  const text =
    JSON.stringify({ version: state.version, previousBlobSha, spaces: state.spaces }, null, 2) +
    '\n';
  if (encoder.encode(text).length > MAX_WORKSPACE_BYTES) throw new Error('Файл макета больше 1 МБ');
  return text;
}

export async function workspaceBlobSha(text) {
  const body = encoder.encode(text);
  const header = encoder.encode('blob ' + body.length + '\0');
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  const hash = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function loadDraft(published, baseSha, known, storage) {
  try {
    const persisted = storage.getItem(DRAFT_KEY);
    if (persisted) {
      const { state, base, submittedSha } = JSON.parse(persisted);
      if (!SHA.test(base ?? '')) throw new Error('Некорректная версия черновика');
      if (submittedSha === baseSha && sameLayout(state, published)) return {};
      return { state: validateWorkspace(state, known), base, submittedSha };
    }
    const legacy = loadWorkspace(published, known, storage);
    if (legacy.recovery) return { warning: legacy.warning };
    if (!sameLayout(legacy.state, published))
      return {
        state: legacy.state,
        base: baseSha,
        warning: 'Прежний макет доступен в «Настроить» как черновик.',
      };
    return {};
  } catch {
    return { warning: 'Не удалось прочитать черновик. Исходная копия сохранена.', recovery: true };
  }
}

export function sameLayout(left, right) {
  return JSON.stringify(left?.spaces) === JSON.stringify(right?.spaces);
}
