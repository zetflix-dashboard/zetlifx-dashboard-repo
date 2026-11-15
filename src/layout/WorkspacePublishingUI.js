import { GitHubPublisher, REPOSITORY } from './GitHubPublisher.js';
import { serializeWorkspace, workspaceBlobSha } from './PublishedWorkspace.js';

const ATTEMPT_KEY = 'zetflix.layout-publication.v1';

export function initWorkspacePublishing({ storage, publishedSha, draft, markSubmitted }) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId('publish-dialog');
  const form = byId('publish-form');
  const tokenInput = byId('github-token');
  const userInput = byId('github-login');
  const status = byId('publication-status');
  const link = byId('publication-link');
  const submit = byId('confirm-publish');
  let busy = false;
  let attempt;
  try {
    attempt = JSON.parse(storage?.getItem(ATTEMPT_KEY) || 'null');
  } catch {
    // Corrupt status does not affect the workspace.
  }
  function remember(next) {
    attempt = next;
    try {
      if (next) storage?.setItem(ATTEMPT_KEY, JSON.stringify(next));
      else storage?.removeItem(ATTEMPT_KEY);
    } catch {
      // The session can still retry the same branch.
    }
  }
  function show(text, number) {
    status.textContent = text;
    link.hidden = !Number.isSafeInteger(number) || number < 1;
    if (!link.hidden) link.href = 'https://github.com/' + REPOSITORY + '/pull/' + number;
  }
  async function refresh() {
    if (busy || !attempt?.number) return;
    const current = attempt;
    if (current.blob === publishedSha) {
      show('Макет доступен на Pages', current.number);
      return;
    }
    if (current.merged) {
      show('В main · обновите страницу после деплоя Pages', current.number);
      return;
    }
    try {
      const pr = await new GitHubPublisher().status(current.number);
      if (busy || attempt !== current) return;
      if (pr.merged_at) {
        remember({ ...current, merged: true });
        show('В main · обновите страницу после деплоя Pages', pr.number);
      } else if (pr.state === 'closed') {
        remember(null);
        show('PR закрыт', pr.number);
      } else if ((await new GitHubPublisher().currentLayoutSha()) !== current.base) {
        if (!busy && attempt === current)
          show('Общий макет изменился · черновик сохранён', pr.number);
      } else if (!busy && attempt === current) {
        show('PR открыт · проверки и слияние в GitHub', pr.number);
      }
    } catch {
      if (!busy && attempt === current) show('Статус в GitHub', current.number);
    }
  }
  byId('publish-workspace').addEventListener('click', () => {
    byId('publish-error').textContent = '';
    dialog.showModal();
    tokenInput.focus();
    if (globalThis.PasswordCredential && navigator.credentials?.get) {
      void navigator.credentials
        .get({ password: true, mediation: 'optional' })
        .then((saved) => {
          if (!dialog.open || !saved || tokenInput.value || userInput.value) return;
          userInput.value = saved.id;
          tokenInput.value = saved.password;
        })
        .catch(() => {});
    }
  });
  byId('cancel-publish').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener('close', () => form.reset());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const token = tokenInput.value.trim();
    const login = userInput.value.trim();
    busy = true;
    submit.disabled = true;
    byId('cancel-publish').disabled = true;
    byId('publish-error').textContent = '';
    try {
      const { state, base } = draft();
      const text = serializeWorkspace(state, base);
      const blob = await workspaceBlobSha(text);
      const publisher = new GitHubPublisher(token);
      if (attempt?.blob !== blob) remember(await publisher.prepare(base, text));
      const pr = await publisher.publish(attempt, text, (pull) => {
        remember({ ...attempt, number: pull.number, head: pull.head.sha });
        show('PR создан · запрашиваем автослияние', pull.number);
      });
      remember({ ...attempt, number: pr.number, head: pr.head.sha });
      markSubmitted(blob);
      show(
        pr.merged_at ? 'В main · ожидается публикация Pages' : 'Автослияние запрошено',
        pr.number,
      );
      if (globalThis.PasswordCredential && navigator.credentials?.store) {
        void navigator.credentials
          .store(
            new PasswordCredential({
              id: login,
              password: token,
              name: 'Публикация макета Зетфликс',
            }),
          )
          .catch(() => {});
      }
      dialog.close();
    } catch (error) {
      byId('publish-error').textContent = error.message;
      if (attempt?.number) {
        show('Проверьте статус PR в GitHub', attempt.number);
        try {
          const pr = await new GitHubPublisher(token).status(attempt.number);
          if (pr.state === 'closed' && !pr.merged_at) remember(null);
        } catch {
          // Keep the attempt to resume after a network error.
        }
      }
    } finally {
      busy = false;
      submit.disabled = false;
      byId('cancel-publish').disabled = false;
    }
  });
  window.addEventListener('focus', refresh);
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && attempt?.blob !== publishedSha) void refresh();
  }, 60000);
  void refresh();
}
