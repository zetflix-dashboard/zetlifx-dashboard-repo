import { SHA, WORKSPACE_PATH, workspaceBlobSha } from './PublishedWorkspace.js';

export const REPOSITORY = 'zetflix-dashboard/zetlifx-dashboard-repo';
const API = 'https://api.github.com';
const REPO = '/repos/' + REPOSITORY;
const PATH = '/contents/' + WORKSPACE_PATH;
const PREFIX = 'admin/layout-';
const BRANCH = /^admin\/layout-[0-9a-f-]{36}$/;
const SCOPE = '<!-- ZETFLIX_SCOPE\nmode: admin\ncharts:\n-->';

export class LayoutConflict extends Error {
  constructor() {
    super(
      'Общий макет изменился. Черновик сохранён. Откройте новую версию Pages и перенесите нужные правки.',
    );
  }
}

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class GitHubPublisher {
  constructor(token = '', fetcher = fetch) {
    this.token = token;
    this.fetcher = fetcher;
  }

  async request(path, method = 'GET', body) {
    const response = await this.fetcher(API + path, {
      method,
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        ...(path !== '/graphql' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}),
        ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new GitHubError(response.status, details.message || 'GitHub API: ' + response.status);
    }
    return response.json();
  }

  async getRef(branch) {
    try {
      return await this.request(REPO + '/git/ref/heads/' + branch);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async verifyProtection() {
    let rules;
    try {
      rules = await this.request(REPO + '/rules/branches/main');
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    const queue = rules?.find((rule) => rule.type === 'merge_queue')?.parameters;
    const checks = rules?.flatMap((rule) => rule.parameters?.required_status_checks || []) || [];
    if (
      !queue ||
      queue.merge_method !== 'MERGE' ||
      queue.max_entries_to_build !== 1 ||
      queue.max_entries_to_merge !== 1 ||
      !rules.some((rule) => rule.type === 'pull_request') ||
      !['scope', 'check'].every((name) => checks.some((check) => check.context === name))
    )
      throw new Error(
        'Администратору нужно включить очередь слияния и обязательные проверки для main.',
      );
  }

  async prepare(base, text) {
    if (!SHA.test(base ?? '')) throw new Error('Некорректная версия макета');
    await this.verifyProtection();
    const current = (await this.getRef('main'))?.object?.sha;
    if (!SHA.test(current ?? '')) throw new Error('Не удалось определить версию main.');
    const file = await this.request(REPO + PATH + '?ref=' + current);
    if (file.sha !== base) throw new LayoutConflict();
    return {
      branch: PREFIX + crypto.randomUUID(),
      current,
      base,
      blob: await workspaceBlobSha(text),
    };
  }

  async publish(attempt, text, onPr = () => {}) {
    const { branch, current, base, blob } = attempt;
    if (!BRANCH.test(branch) || ![current, base, blob].every((item) => SHA.test(item ?? '')))
      throw new Error('Некорректные данные публикации');
    const pull = (
      await this.request(
        REPO +
          '/pulls?state=all&base=main&head=' +
          encodeURIComponent(REPOSITORY.split('/')[0] + ':' + branch),
      )
    )[0];
    if (pull) {
      onPr(pull);
      if (pull.merged_at) return pull;
      if (pull.state === 'closed') throw new Error('Этот PR закрыт. Начните новую публикацию.');
      if (attempt.head && pull.head.sha !== attempt.head)
        throw new Error('Ветка PR была изменена на GitHub.');
      const committed = await this.request(REPO + PATH + '?ref=' + pull.head.sha);
      if (committed.sha !== blob) throw new Error('Ветка PR была изменена на GitHub.');
      await this.verifyProtection();
      if ((await this.currentLayoutSha()) !== base) throw new LayoutConflict();
      return this.mergeWhenReady(pull);
    }
    if ((await workspaceBlobSha(text)) !== blob)
      throw new Error('Содержимое черновика изменилось. Начните новую публикацию.');
    await this.verifyProtection();
    if ((await this.currentLayoutSha()) !== base) throw new LayoutConflict();
    let ref = await this.getRef(branch);
    if (!ref) {
      ref = await this.request(REPO + '/git/refs', 'POST', {
        ref: 'refs/heads/' + branch,
        sha: current,
      });
    }
    const branchFile = await this.request(REPO + PATH + '?ref=' + ref.object.sha);
    if (ref.object.sha === current && branchFile.sha === base) {
      const bytes = new TextEncoder().encode(text);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await this.request(REPO + PATH, 'PUT', {
        message: 'Обновить общий макет дашборда',
        content: btoa(binary),
        sha: base,
        branch,
      });
    } else if (branchFile.sha !== blob) {
      throw new Error('Ветка публикации была изменена на GitHub.');
    }
    const created = await this.request(REPO + '/pulls', 'POST', {
      title: 'Обновить общий макет дашборда',
      head: branch,
      base: 'main',
      body: SCOPE,
    });
    onPr(created);
    return this.mergeWhenReady(created);
  }

  async mergeWhenReady(pull) {
    const { node_id: id, head, number } = pull;
    const result = await this.request('/graphql', 'POST', {
      query:
        'mutation($id: ID!, $sha: GitObjectID!) { enablePullRequestAutoMerge(input: {pullRequestId: $id, expectedHeadOid: $sha}) { pullRequest { id } } }',
      variables: { id, sha: head.sha },
    });
    if (result.data?.enablePullRequestAutoMerge?.pullRequest) return pull;
    const read = await this.request('/graphql', 'POST', {
      query:
        'query($id: ID!) { node(id: $id) { ... on PullRequest { merged headRefOid mergeStateStatus autoMergeRequest { enabledAt } mergeQueueEntry { id } } } }',
      variables: { id },
    });
    const state = read.data?.node;
    if (state?.merged) return this.status(number);
    if (state?.headRefOid === head.sha && (state.autoMergeRequest || state.mergeQueueEntry))
      return pull;
    if (state?.headRefOid === head.sha && state.mergeStateStatus === 'CLEAN') {
      const queued = await this.request('/graphql', 'POST', {
        query:
          'mutation($id: ID!, $sha: GitObjectID!) { enqueuePullRequest(input: {pullRequestId: $id, expectedHeadOid: $sha}) { mergeQueueEntry { id } } }',
        variables: { id, sha: head.sha },
      });
      if (queued.data?.enqueuePullRequest?.mergeQueueEntry) return pull;
    }
    throw new Error(
      'PR №' +
        number +
        ' создан. GitHub не подтвердил автослияние: ' +
        (result.errors?.[0]?.message || 'откройте PR и проверьте требования.'),
    );
  }

  async currentLayoutSha() {
    return (await this.request(REPO + PATH + '?ref=main')).sha;
  }

  status(number) {
    return this.request(REPO + '/pulls/' + Number(number));
  }
}
