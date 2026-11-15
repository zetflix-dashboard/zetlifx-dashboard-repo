import {
  MAX_WORKSPACE_BYTES,
  mergeWorkspace,
  sameLayout,
  serializeWorkspace,
  validateSharedWorkspace,
} from './SharedWorkspace.js';

export const repository =
  import.meta.env?.VITE_WORKSPACE_REPOSITORY || 'zetflix-dashboard/zetlifx-dashboard-repo';
export const branch = import.meta.env?.VITE_WORKSPACE_BRANCH || 'workspace-sync';
const path = 'workspace.json';
const contents = 'https://api.github.com/repos/' + repository + '/contents/' + path;
const raw =
  'https://raw.githubusercontent.com/' + repository + '/' + encodeURIComponent(branch) + '/' + path;

export class WorkspaceRequestError extends Error {
  constructor(response) {
    super('GitHub вернул ошибку ' + response.status);
    this.status = response.status;
    this.retryAt = Date.now() + Number(response.headers.get('retry-after') || 0) * 1000;
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    if (response.headers.get('x-ratelimit-remaining') === '0' && reset)
      this.retryAt = Math.max(this.retryAt, reset * 1000);
    this.limited =
      this.status === 429 ||
      (this.status === 403 &&
        (response.headers.has('retry-after') ||
          response.headers.get('x-ratelimit-remaining') === '0'));
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new WorkspaceRequestError(response);
  return response;
}

function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export class WorkspaceSync {
  constructor(known) {
    this.known = known;
  }

  parse(text) {
    if (new TextEncoder().encode(text).length > MAX_WORKSPACE_BYTES)
      throw new Error('Файл макета больше 1 МБ');
    return validateSharedWorkspace(JSON.parse(text), this.known);
  }

  async read(token = '') {
    if (token) {
      const headers = { Authorization: 'Bearer ' + token };
      const response = await request(contents + '?ref=' + encodeURIComponent(branch), {
        headers,
        cache: 'no-store',
      });
      const { content, sha } = await response.json();
      if (!/^[a-f0-9]{40}$/.test(sha) || typeof content !== 'string')
        throw new Error('GitHub вернул некорректный файл макета');
      const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
      return { state: this.parse(new TextDecoder().decode(bytes)), sha };
    }
    // Public viewers read the branch via the raw CDN instead of spending REST API quota.
    // A new URL per check avoids reusing a stale cached response for a moving branch.
    const response = await request(raw + '?at=' + Date.now(), { cache: 'no-store' });
    return { state: this.parse(await response.text()) };
  }

  async save({ base, state }, token) {
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latest = await this.read(token);
      const merged = mergeWorkspace(base, state, latest.state, this.known);
      if (sameLayout(merged, latest.state)) return merged;
      try {
        await request(contents, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: 'Update shared dashboard workspace',
            branch,
            sha: latest.sha,
            content: encode(serializeWorkspace(merged)),
          }),
        });
        return merged;
      } catch (error) {
        if (error.status !== 409 || attempt === 2) throw error;
      }
    }
  }
}
