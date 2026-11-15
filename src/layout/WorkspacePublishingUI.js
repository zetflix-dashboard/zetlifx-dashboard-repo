import { GitHubPublisher, LayoutConflict, REPOSITORY } from './GitHubPublisher.js';
import { serializeWorkspace, workspaceBlobSha } from './PublishedWorkspace.js';
import { summarizeWorkspaceChanges } from './WorkspaceChanges.js';

const ATTEMPT_KEY = 'zetflix.layout-publication.v1';
const INITIAL_POLL_MS = 60000;
const RETRY_POLL_MS = 120000;

function readableError(error) {
  if (error instanceof LayoutConflict)
    return 'Общий макет обновился. Перенесите нужные изменения перед новой публикацией.';
  if (error.status === 401) return 'Не удалось войти в GitHub. Проверьте токен или создайте новый.';
  if (error.status === 403)
    return 'Нет доступа к публикации. Проверьте разрешения токена и доступ к репозиторию.';
  if (error.status === 404)
    return 'Репозиторий недоступен этому аккаунту. Проверьте настройки доступа.';
  if (error.status === 429) return 'GitHub временно ограничил запросы. Повторите позже.';
  if (error instanceof TypeError)
    return 'Нет соединения с GitHub. Ваш макет сохранён; повторите попытку позже.';
  return error.message || 'Не удалось отправить изменения. Ваш макет сохранён.';
}

export function initWorkspacePublishing({
  storage,
  publishedSha,
  publishedWorkspace,
  draft,
  markSubmitted,
  onConflict,
}) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId('publish-dialog');
  const form = byId('publish-form');
  const tokenInput = byId('github-token');
  const userInput = byId('github-login');
  const toast = byId('publication-toast');
  const status = byId('publication-status');
  const progress = byId('publication-progress');
  const details = byId('publication-details');
  const steps = [...byId('publication-steps').children];
  const submit = byId('confirm-publish');
  const link = byId('publication-link');
  const detailsLink = byId('publication-details-link');
  let busy = false;
  let refreshing = false;
  let lastStage = '';
  let timer;
  let toastTimer;
  let attempt;
  try {
    attempt = JSON.parse(storage?.getItem(ATTEMPT_KEY) || 'null');
  } catch {
    // Invalid publication metadata must never delete the user's workspace.
  }

  function remember(next) {
    attempt = next;
    try {
      if (next) storage?.setItem(ATTEMPT_KEY, JSON.stringify(next));
      else storage?.removeItem(ATTEMPT_KEY);
    } catch {
      // Publication can still complete in the active tab.
    }
  }

  function stage(name, label, description, number, notify = false) {
    const order = { sending: 1, checking: 2, deploying: 3, complete: 4 };
    const stageIndex = order[name] || 0;
    progress.hidden = false;
    progress.textContent = label;
    progress.setAttribute('aria-expanded', String(!details.hidden));
    byId('publication-details-title').textContent = label;
    byId('publication-explanation').textContent = description;
    for (let i = 0; i < steps.length; i++) {
      steps[i].classList.toggle('is-complete', stageIndex > i + 1);
      steps[i].classList.toggle('is-active', stageIndex === i + 1);
    }
    link.hidden = detailsLink.hidden = !Number.isSafeInteger(number) || number < 1;
    if (!link.hidden) {
      link.href = detailsLink.href = 'https://github.com/' + REPOSITORY + '/pull/' + number;
    }
    if (
      (notify || (name === 'complete' && lastStage !== name) || name === 'error') &&
      lastStage !== name
    ) {
      clearTimeout(toastTimer);
      toast.hidden = false;
      status.textContent = label;
      toastTimer = setTimeout(() => {
        toast.hidden = true;
      }, 12000);
    }
    lastStage = name;
  }

  byId('dismiss-publication').addEventListener('click', () => {
    clearTimeout(toastTimer);
    toast.hidden = true;
  });
  progress.addEventListener('click', () => {
    details.hidden = !details.hidden;
    progress.setAttribute('aria-expanded', String(!details.hidden));
  });

  async function isDeployed(blob) {
    try {
      const response = await fetch(import.meta.env.BASE_URL + 'workspace-version.json', {
        cache: 'no-store',
      });
      if (!response.ok) return false;
      const manifest = await response.json();
      return manifest.sha === blob;
    } catch {
      return false;
    }
  }

  async function refresh() {
    if (busy || refreshing || !attempt?.number) return;
    refreshing = true;
    const current = attempt;
    try {
      if (current.blob === publishedSha || (current.merged && (await isDeployed(current.blob)))) {
        stage(
          'complete',
          'Изменения доступны команде',
          'Обновите страницу, чтобы открыть новую версию.',
          current.number,
        );
        return;
      }
      if (current.merged) {
        stage(
          'deploying',
          'Обновляем общий дашборд',
          'Изменения приняты. Ожидаем появления новой версии на сайте.',
          current.number,
        );
        return;
      }
      const publisher = new GitHubPublisher();
      const pr = await publisher.status(current.number);
      if (attempt !== current) return;
      if (pr.merged_at) {
        remember({ ...current, merged: true });
        if (await isDeployed(current.blob)) {
          stage(
            'complete',
            'Изменения доступны команде',
            'Обновите страницу, чтобы открыть новую версию.',
            pr.number,
          );
        } else {
          stage(
            'deploying',
            'Обновляем общий дашборд',
            'Изменения приняты. Ожидаем появления новой версии на сайте.',
            pr.number,
          );
        }
      } else if (pr.state === 'closed') {
        remember(null);
        stage(
          'error',
          'Публикация отменена',
          'Отправьте сохранённые изменения ещё раз.',
          pr.number,
          true,
        );
      } else if ((await publisher.currentLayoutSha()) !== current.base) {
        stage(
          'error',
          'Общий макет обновился',
          'Ваш черновик сохранён. Сначала перенесите правки в актуальную версию.',
          pr.number,
          true,
        );
      } else {
        stage(
          'checking',
          'Проверяем изменения',
          'GitHub проверяет макет и готовит его к публикации. Можно закрыть страницу.',
          pr.number,
        );
      }
    } catch {
      if (attempt === current) {
        stage(
          'offline',
          'Не удалось проверить публикацию',
          'Ваш черновик сохранён. Попробуйте проверить статус позже.',
          current.number,
          true,
        );
      }
    } finally {
      refreshing = false;
    }
  }

  async function checkNow() {
    await refresh();
    if (attempt?.number) schedule(attempt.merged ? RETRY_POLL_MS : INITIAL_POLL_MS);
  }

  function schedule(delay) {
    clearTimeout(timer);
    if (!attempt?.number || lastStage === 'complete' || lastStage === 'error') return;
    timer = setTimeout(async () => {
      if (document.visibilityState === 'visible') await refresh();
      schedule(lastStage === 'offline' ? RETRY_POLL_MS : INITIAL_POLL_MS);
    }, delay);
  }

  byId('publication-recheck').addEventListener('click', checkNow);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !details.hidden) {
      details.hidden = true;
      progress.setAttribute('aria-expanded', 'false');
    }
  });
  byId('publish-workspace').addEventListener('click', () => {
    byId('publish-error').textContent = '';
    const { state } = draft();
    const changes = summarizeWorkspaceChanges(publishedWorkspace, state);
    const summaries = [
      changes.spaces + ' пространств',
      changes.added + ' добавлено',
      changes.removed + ' удалено',
      changes.moved + ' перемещено',
      changes.resized + ' изменён размер',
      changes.updated + ' изменены настройки',
    ];
    byId('publish-summary').textContent = summaries.join(' · ');
    dialog.showModal();
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
  byId('cancel-publish').addEventListener('click', () => {
    if (!busy) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (!busy) form.reset();
  });

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
      stage(
        'sending',
        'Отправляем изменения',
        'Создаём запрос на обновление командного макета.',
        attempt?.number,
      );
      const pr = await publisher.publish(attempt, text, (pull) => {
        remember({ ...attempt, number: pull.number, head: pull.head.sha });
        stage(
          'checking',
          'Проверяем изменения',
          'Запрос отправлен. Идут проверки GitHub.',
          pull.number,
          true,
        );
      });
      remember({ ...attempt, number: pr.number, head: pr.head.sha, merged: Boolean(pr.merged_at) });
      markSubmitted(blob);
      stage(
        pr.merged_at ? 'deploying' : 'checking',
        pr.merged_at ? 'Обновляем общий дашборд' : 'Проверяем изменения',
        'Отправка завершена. Публикацию можно проверить позднее.',
        pr.number,
        true,
      );
      schedule(INITIAL_POLL_MS);
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
      byId('publish-error').textContent = readableError(error);
      if (error instanceof LayoutConflict) {
        dialog.close();
        onConflict();
      }
      if (attempt?.number) {
        stage(
          'error',
          'Не удалось завершить публикацию',
          readableError(error),
          attempt.number,
          true,
        );
      }
    } finally {
      busy = false;
      submit.disabled = false;
      byId('cancel-publish').disabled = false;
    }
  });
  window.addEventListener('focus', () => {
    void checkNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkNow();
  });
  void checkNow();
}
