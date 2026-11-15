import { GitHubPublisher, REPOSITORY } from './GitHubPublisher.js';
import { serializeWorkspace, workspaceBlobSha } from './PublishedWorkspace.js';

const ATTEMPT_KEY = 'zetflix.layout-publication.v1';

export function initWorkspacePublishing({ storage, publishedSha, draft, preview, markSubmitted }) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId('publish-dialog');
  const form = byId('publish-form');
  const tokenInput = byId('github-token');
  const userInput = byId('github-login');
  const toast = byId('publication-toast');
  const status = byId('publication-status');
  let lastNotice;
  let toastTimer;
  byId('dismiss-publication').addEventListener('click', () => {
    clearTimeout(toastTimer);
    toast.hidden = true;
  });
  const link = byId('publication-link');
  const submit = byId('confirm-publish');
  const progress = byId('publication-progress');
  const progressTitle = byId('progress-title');
  const progressDescription = byId('progress-description');
  const progressLink = byId('progress-link');
  function stage(kind, number) {
    const descriptions = {
      submitted: ['Изменения отправлены', 'Проверяем макет перед обновлением общего дашборда.'],
      checking: ['Проверяем изменения', 'GitHub выполняет обязательные проверки.'],
      merged: ['Обновляем общий дашборд', 'Изменения приняты. Новая версия сайта ещё может быть недоступна.'],
      available: ['Изменения доступны команде', 'Сайт содержит отправленный макет.'],
      conflict: ['Общий макет обновился', 'Ваш черновик сохранён. Скачайте копию и перенесите нужные изменения на новую версию.'],
      failed: ['Публикация не завершилась', 'Проверьте подробности и повторите отправку после исправления ошибки.'],
      unknown: ['Статус пока неизвестен', 'Не удалось связаться с GitHub. Изменения в браузере сохранены.'],
    };
    const [title, description] = descriptions[kind];
    progress.hidden = false;
    progressTitle.textContent = title;
    progressDescription.textContent = description;
    byId('progress-summary').textContent = title;
    progressLink.hidden = !Number.isSafeInteger(number) || number < 1;
    if (!progressLink.hidden) progressLink.href = 'https://github.com/' + REPOSITORY + '/pull/' + number;
  }
  function renderPreview() {
    const counts = preview();
    const labels = { spaces: 'Изменено пространств', added: 'Добавлено блоков', removed: 'Удалено блоков', moved: 'Перемещено блоков', resized: 'Изменено размеров', filters: 'Изменено фильтров', headings: 'Изменено заголовков' };
    const container = byId('publish-preview');
    container.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = 'Что изменится для команды';
    container.append(title);
    const list = document.createElement('ul');
    for (const [key, label] of Object.entries(labels)) {
      if (!counts[key]) continue;
      const item = document.createElement('li');
      item.textContent = label + ': ' + counts[key];
      list.append(item);
    }
    if (!list.children.length) {
      const item = document.createElement('li');
      item.textContent = 'Изменений относительно загруженного общего макета нет';
      list.append(item);
    }
    container.append(list);
  }
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
    const key = JSON.stringify([text, number]);
    if (key === lastNotice) return;
    lastNotice = key;
    clearTimeout(toastTimer);
    toast.hidden = false;
    status.textContent = text;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 12000);
    link.hidden = !Number.isSafeInteger(number) || number < 1;
    if (!link.hidden) link.href = 'https://github.com/' + REPOSITORY + '/pull/' + number;
  }
  let refreshing = false;
  async function refresh() {
    if (busy || refreshing || !attempt?.number) return;
    const current = attempt;
    if (current.blob === publishedSha) {
      stage('available', current.number);
      return;
    }
    if (current.merged) {
      stage('merged', current.number);
      return;
    }
    refreshing = true;
    try {
      const pr = await new GitHubPublisher().status(current.number);
      if (busy || attempt !== current) return;
      if (pr.merged_at) {
        remember({ ...current, merged: true });
        stage('merged', pr.number);
      } else if (pr.state === 'closed') {
        remember(null);
        stage('failed', pr.number);
        show('Изменения не были опубликованы', pr.number);
      } else if ((await new GitHubPublisher().currentLayoutSha()) !== current.base) {
        if (!busy && attempt === current)
          { stage('conflict', pr.number); show('Команда обновила макет · ваша копия сохранена', pr.number); }
      } else if (!busy && attempt === current) {
        { stage('checking', pr.number); }
      }
    } catch {
      if (!busy && attempt === current) stage('unknown', current.number);
    } finally {
      refreshing = false;
    }
  }
  byId('publish-workspace').addEventListener('click', () => {
    byId('publish-error').textContent = '';
    renderPreview();
    dialog.showModal();
    tokenInput.focus();
    if (globalThis.PasswordCredential && navigator.credentials?.get) {
      void navigator.credentials
        .get({ password: true, mediation: 'optional' })
        .then((saved) => {
          if (!dialog.open || !saved || tokenInput.value || userInput.value) return;
          userInput.value = '@' + saved.id.replace(/^@/, '');
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
    const login = userInput.value.trim().replace(/^@/, '');
    if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) {
      byId('publish-error').textContent = 'Введите имя аккаунта в формате @username.';
      userInput.focus();
      return;
    }
    userInput.value = '@' + login;
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
        stage('submitted', pull.number);
        show('Изменения отправлены. Следите за статусом в верхней панели', pull.number);
      });
      remember({ ...attempt, number: pr.number, head: pr.head.sha });
      markSubmitted(blob);
      stage(pr.merged_at ? 'merged' : 'checking', pr.number);
      show(pr.merged_at ? 'Обновляем общий дашборд' : 'Изменения отправлены на проверку', pr.number);
      if (globalThis.PasswordCredential && navigator.credentials?.store) {
        void navigator.credentials
          .store(
            new PasswordCredential({
              id: '@' + login,
              password: token,
              name: 'Публикация макета Зетфликс',
            }),
          )
          .catch(() => {});
      }
      dialog.close();
    } catch (error) {
      const text = error.status === 401 ? 'Неверный или просроченный токен GitHub.' : error.status === 403 ? 'Недостаточно прав для публикации или временное ограничение GitHub.' : error.status === 404 ? 'Репозиторий недоступен для этого аккаунта.' : error.message;
      byId('publish-error').textContent = text;
      stage(/Общий макет изменился/.test(error.message) ? 'conflict' : 'failed', attempt?.number);
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
  byId('check-publication').addEventListener('click', () => void refresh());
  window.addEventListener('focus', () => void refresh());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  // Deliberately avoid GitHub's low unauthenticated REST API quota.
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && attempt?.blob !== publishedSha) void refresh();
  }, 180000);
  if (attempt?.number) stage('submitted', attempt.number);
  void refresh();
}
