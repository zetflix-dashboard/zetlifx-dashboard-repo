import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const fixture = readFileSync('tests/fixtures/workspace.json', 'utf8');
function mockWorkspace() {
  let file = fixture;
  let writes = 0;
  let loseResponse = false;
  let stalePublicFile;
  const sha = () => createHash('sha1').update(file).digest('hex');
  async function install(page) {
    await page.route('https://raw.githubusercontent.com/**/workspace.json?*', (route) =>
      route.fulfill({ json: JSON.parse(stalePublicFile ?? file) }),
    );
    await page.route('https://api.github.com/**/contents/workspace.json*', async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({
          json: { sha: sha(), content: Buffer.from(file).toString('base64') },
        });
      const update = route.request().postDataJSON();
      if (update.sha !== sha()) return route.fulfill({ status: 409 });
      file = Buffer.from(update.content, 'base64').toString();
      writes++;
      if (loseResponse) {
        loseResponse = false;
        return route.abort();
      }
      await route.fulfill({ json: { content: { sha: sha() } } });
    });
  }
  return {
    install,
    writes: () => writes,
    delayPublicRead: () => {
      stalePublicFile = file;
    },
    resumePublicRead: () => {
      stalePublicFile = undefined;
    },
    loseNextResponse: () => {
      loseResponse = true;
    },
  };
}

const key = 'zetflix.shared-workspace.v1';
async function save(page) {
  await page.locator('#save-workspace').click();
  await expect(page.locator('#edit-btn')).toBeEnabled();
}
test.beforeEach(async ({ page }) => {
  await mockWorkspace().install(page);
  await page.addInitScript(() =>
    sessionStorage.setItem('zetflix.workspace-token.v1', 'test-token'),
  );
  page.on('pageerror', (error) => console.error('Browser exception:', error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error') console.error('Browser console:', entry.text());
  });
});
async function ready(page) {
  await page.goto('./');
  await expect(page.locator('.widget-chart canvas')).toHaveCount(2);
  await expect(page.locator('.widget-overlay:visible')).toHaveCount(0);
}
test('real Parquet queries, shared table, period filter, no runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.locator('.widget-table').first().click();
  await expect(page.locator('tbody tr')).toHaveCount(24);
  await expect(page.locator('tbody tr').first()).toContainText('01.24');
  await page.locator('#period-trigger').click();
  await page.locator('#period-months [data-month="2024-01"]').click();
  await page.locator('#period-months [data-month="2024-01"]').click();
  await page.locator('#period-apply').click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first().locator('td').nth(1)).not.toHaveText('—');
  await page.locator('#period-trigger').click();
  await page.locator('[data-period-preset="all"]').click();
  await page.locator('#period-apply').click();
  await expect(page.locator('tbody tr')).toHaveCount(24);
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('dynamic spaces persist, rename, delete, undo and keyboard navigation', async ({ page }) => {
  await ready(page);
  await page.locator('#create-space').click();
  await page.getByLabel('Название', { exact: true }).fill('Контент');
  await page.locator('#space-form').getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('tab', { name: 'Контент' })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#empty-action').click();
  await page.locator('.catalog-option').first().click();
  await expect(page.locator('.grid-stack-item')).toHaveCount(1);
  await save(page);
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key))?.spaces.length, key))
    .toBe(2);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Контент' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Контент' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.grid-stack-item')).toHaveCount(1);
  await page.locator('.app-menu summary').click();
  await page.locator('#rename-space').click();
  await page.locator('#space-name').fill('Финансы');
  await page.locator('#space-form').getByRole('button', { name: 'Сохранить' }).click();
  await page.locator('#delete-space').click();
  await page.locator('#confirm-dialog button[value="confirm"]').click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.locator('#undo-btn').click();
  await expect(page.getByRole('tab', { name: 'Финансы' })).toBeVisible();
  await page.getByRole('tab', { name: 'Финансы' }).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Мой дашборд' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
test('mobile uses full width and saves canonical layout across resize', async ({ page }) => {
  await ready(page);
  await page.locator('#edit-btn').click();
  await page.locator('.widget-grip').first().focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#dashboard-grid')).toHaveClass(/gs-1\b/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await save(page);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.reload();
  await page.locator('#edit-btn').click();
  await expect(page.locator('.widget-chart canvas')).toHaveCount(2);
  await expect(page.locator('#dashboard-grid')).toHaveClass(/gs-1\b/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('#dashboard-grid')).toHaveClass(/gs-12\b/);
  await expect(page.locator('[data-instance-id="c03-initial"]')).toHaveAttribute('gs-w', '6');
  await expect(page.locator('[data-instance-id="c03-initial"]')).toHaveAttribute('gs-h', '6');
});
test('cards added on mobile keep desktop width after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.locator('#edit-btn').click();
  await page.locator('#add-btn').click();
  await page.locator('.catalog-option').first().click();
  await expect(page.locator('.grid-stack-item')).toHaveCount(3);
  await save(page);
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key))?.spaces[0].widgets.length, key),
    )
    .toBe(3);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).spaces[0].widgets.map((widget) => widget.w),
      key,
    ),
  ).toEqual([6, 6, 6]);
  await page.reload();
  await page.locator('#edit-btn').click();
  await expect(page.locator('.grid-stack-item')).toHaveCount(3);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('#dashboard-grid')).toHaveClass(/gs-12\b/);
  for (const card of await page.locator('.grid-stack-item').all()) {
    await expect(card).toHaveAttribute('gs-w', '6');
  }
});
test('legacy empty layout is kept and malformed import does not replace work', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'zetflix.layout.overview.v1',
      JSON.stringify({ version: 1, dashboardId: 'overview', widgets: [] }),
    ),
  );
  await page.goto('./');
  await expect(page.getByRole('tab', { name: 'Мой дашборд' })).toBeVisible();
  await page.locator('.app-menu summary').click();
  await expect(page.locator('#recover-workspace')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('#recover-workspace').click();
  await download;
  await page.locator('#import-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version": 99}'),
  });
  await expect(page.locator('#message')).toContainText('Ошибка импорта');
  await expect(page.getByRole('tab')).toHaveCount(1);
});
test('loading failure can recover with Retry without damaging other cards', async ({ page }) => {
  await page.route('**/data/pl_control.parquet*', (route) => route.abort());
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible();
  await expect(page.locator('.widget-chart canvas')).toHaveCount(1);
  await page.unroute('**/data/pl_control.parquet*');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.locator('.widget-overlay:visible')).toHaveCount(0);
  await expect(page.locator('.widget-chart canvas')).toHaveCount(2);
});

test('resize handles all directions, stay invisible and use directional cursors', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#edit-btn').click();
  const widget = page.locator('[data-instance-id="c03-initial"]');
  for (const direction of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    const handle = widget.locator('.ui-resizable-' + direction);
    await expect(handle).toHaveCount(1);
    await expect(handle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const cursor =
      direction === 'n' || direction === 's'
        ? 'ns-resize'
        : direction === 'e' || direction === 'w'
          ? 'ew-resize'
          : direction === 'ne' || direction === 'sw'
            ? 'nesw-resize'
            : 'nwse-resize';
    await expect(handle).toHaveCSS('cursor', cursor);
  }
  const drag = widget.locator('.widget-grip');
  await expect(drag).toHaveAttribute('aria-label', /Переместить график/);
  await expect(drag.locator('svg')).toHaveCount(1);
  await expect(drag).not.toContainText('Переместить');
});

test('theme toggle persists and recolors rendered charts without new queries', async ({ page }) => {
  await ready(page);
  const toggle = page.locator('#theme-toggle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);
  const initial = await page.locator('html').getAttribute('data-theme');
  const next = initial === 'dark' ? 'light' : 'dark';
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', next);
  await expect(toggle).toHaveAttribute('aria-label', /Включить/);
  await expect(page.locator('.widget-chart canvas')).toHaveCount(2);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
    .toBe(next === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(244, 243, 240)');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('zetflix.theme'))).toBe(next);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', next);
  await expect(page.locator('.widget-chart canvas')).toHaveCount(2);
});

test('month range picker supports presets, cancel, and responsive layout', async ({ page }) => {
  await ready(page);
  const trigger = page.locator('#period-trigger');
  const toolbarLayout = () =>
    page.locator('.workspace-toolbar').evaluate((toolbar) => {
      const tabs = toolbar.querySelector('.space-navigation').getBoundingClientRect();
      const controls = toolbar.querySelector('.period-controls').getBoundingClientRect();
      return { gap: controls.left - tabs.right, onOneRow: controls.top < tabs.bottom };
    });
  expect(await toolbarLayout()).toEqual({ gap: 14, onOneRow: true });
  await expect(trigger).toContainText('2024');
  await trigger.click();
  await expect(page.locator('#period-panel')).toBeVisible();
  await expect(page.locator('#period-months .period-month')).toHaveCount(24);
  await page.locator('[data-period-preset="2025"]').click();
  await page.locator('#period-apply').click();
  await expect(trigger).toContainText('2025');
  await trigger.click();
  await page.locator('[data-period-preset="2024"]').click();
  await page.locator('#period-cancel').click();
  await expect(trigger).toContainText('2025');
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#period-panel')).toBeHidden();
  await trigger.click();
  await page.locator('[data-period-preset="all"]').click();
  await page.locator('#period-apply').click();
  await expect(trigger).toContainText('2024');
  await expect(trigger).toContainText('2025');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await toolbarLayout()).toEqual({ gap: 8, onOneRow: true });
  await trigger.click();
  await expect(page.locator('#period-panel')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test('OLED appearance and compact read-only widget actions', async ({ page }) => {
  await ready(page);
  await page.locator('#theme-toggle').click();
  const dark = await page.locator('html').getAttribute('data-theme');
  if (dark !== 'dark') await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
    .toBe('rgb(0, 0, 0)');
  await expect(page.locator('.brand-caption')).toHaveCount(0);
  await expect(page.locator('#filters-reset')).toHaveCount(0);
  await expect(page.locator('.menu-trigger')).toContainText('···');
  await expect(page.locator('.widget-grip').first()).toBeHidden();
  await expect(page.locator('.widget-remove').first()).toBeHidden();
  await expect(page.locator('.widget-title-row .widget-info').first()).toBeVisible();
  await expect(page.locator('.widget-info summary').first()).toHaveAttribute(
    'aria-label',
    /О данных/,
  );
  await page.locator('#edit-btn').click();
  await expect(page.locator('.widget-grip').first()).toBeVisible();
  await expect(page.locator('.widget-remove').first()).toBeVisible();
  await save(page);
  await expect(page.locator('.widget-grip').first()).toBeHidden();
});

test('C14 scatter, C15 donut and C20 RFM load with actual Parquet and data bars', async ({
  page,
}) => {
  test.setTimeout(180000);
  await ready(page);
  await page.locator('#edit-btn').click();
  for (const id of ['C14', 'C15', 'C20']) {
    await page.locator('#add-btn').click();
    await page.locator('#catalog-search').fill(id);
    await page.locator('.catalog-option:visible').first().click();
  }
  await expect(page.locator('.grid-stack-item')).toHaveCount(5);
  await expect(page.locator('.widget-chart canvas')).toHaveCount(4, { timeout: 120000 });
  await expect(page.locator('.widget-overlay:visible')).toHaveCount(0, { timeout: 120000 });
  const rfm = page.locator('.grid-stack-item').filter({ hasText: 'RFM-сегменты пользователей' });
  await expect(rfm.locator('tbody tr')).toHaveCount(21);
  await expect(rfm.locator('.cell-bar').first()).toHaveAttribute('data-bar-index', '0');
  await expect(rfm.locator('td.cell-bar').first()).toHaveCSS('background-image', /linear-gradient/);
  const donut = page.locator('.grid-stack-item').filter({ hasText: 'Доля просмотров оригиналов' });
  await expect(donut.locator('canvas')).toHaveCount(1);
  const scatter = page.locator('.grid-stack-item').filter({ hasText: 'Стоимость часа по тайтлам' });
  await expect(scatter.locator('canvas')).toHaveCount(1);
  await save(page);
  await expect(page.locator('.widget-grip').first()).toBeHidden();
});

test('floating editor supports semantic headings, persistence and undo', async ({ page }) => {
  await ready(page);
  const bar = page.locator('#editor-bar');
  await expect(bar).toBeHidden();
  await page.locator('#edit-btn').click();
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS('position', 'fixed');
  await expect(page.locator('#undo-btn svg')).toHaveCount(1);
  await expect(page.locator('#redo-btn svg')).toHaveCount(1);
  await page.locator('#add-heading-btn').click();
  await page.locator('#heading-text').fill('Важные показатели');
  await page.locator('#heading-form button[type="submit"]').click();
  await expect(page.locator('.heading-title')).toHaveText('Важные показатели');
  await page.locator('.heading-edit').click();
  await page.locator('#heading-text').fill('Экономика подписок');
  await page.locator('#heading-form button[type="submit"]').click();
  await expect(page.locator('.heading-title')).toHaveText('Экономика подписок');
  await page.locator('#undo-btn').click();
  await expect(page.locator('.heading-title')).toHaveText('Важные показатели');
  await save(page);
  await expect(page.locator('.heading-controls')).toBeHidden();
  await expect(page.locator('.heading-title')).toHaveText('Важные показатели');
  await page.reload();
  await expect(page.locator('.heading-title')).toHaveText('Важные показатели');
  await expect(page.locator('.widget-chart canvas')).toHaveCount(2);
});

test('catalog statuses distinguish current, other and not-yet-used charts', async ({ page }) => {
  await ready(page);
  await page.locator('#edit-btn').click();
  await page.locator('#add-btn').click();
  const c03 = page.locator('.catalog-option[data-chart-id="C03"]');
  const c14 = page.locator('.catalog-option[data-chart-id="C14"]');
  await expect(c03.locator('.catalog-status')).toContainText('На дашборде');
  await expect(c14.locator('.catalog-status')).toHaveText('Не добавлен');
  await c14.click();
  await page.locator('#add-btn').click();
  await expect(c14.locator('.catalog-status')).toContainText('На дашборде');
  await page.locator('#catalog .dialog-heading button').click();
  await page.locator('#create-space').click();
  await page.locator('#space-name').fill('Другое пространство');
  await page.locator('#space-form button[type="submit"]').click();
  await page.locator('#add-btn').click();
  await expect(c14.locator('.catalog-status')).toHaveText('В другом пространстве');
});

test('local filters are isolated by widget and saved with the workspace', async ({ page }) => {
  test.setTimeout(180000);
  await ready(page);
  await page.locator('#edit-btn').click();
  await page.locator('#add-btn').click();
  await page.locator('.catalog-option[data-chart-id="C14"]').click();
  const cards = page.locator('.grid-stack-item').filter({ hasText: 'Стоимость часа по тайтлам' });
  await expect(cards.locator('canvas')).toHaveCount(1, { timeout: 120000 });
  const selector = cards.locator('.widget-filter-select');
  await expect(selector).toHaveCount(1);
  await selector.selectOption('Драма');
  await save(page);
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)).spaces[0].widgets.find((w) => w.chartId === 'C14')
            ?.localFilters?.genre,
        key,
      ),
    )
    .toBe('Драма');
  await expect(cards.locator('.widget-overlay:visible')).toHaveCount(0, { timeout: 120000 });
  await expect(selector).toHaveValue('Драма');
  await page.reload();
  await page.locator('#edit-btn').click();
  await expect(cards.locator('.widget-filter-select')).toHaveValue('Драма');
});

test('RFM sorts raw values and keeps compact bars and totals in the scroll flow', async ({
  page,
}) => {
  test.setTimeout(180000);
  await ready(page);
  await page.locator('#edit-btn').click();
  await page.locator('#add-btn').click();
  await page.locator('.catalog-option[data-chart-id="C20"]').click();
  const card = page.locator('.grid-stack-item').filter({ hasText: 'RFM-сегменты пользователей' });
  const table = card.locator('.data-table');
  await expect(table.locator('tbody tr')).toHaveCount(21, { timeout: 120000 });
  await expect(table.locator('thead th')).toHaveCount(9);
  await expect(table.locator('.cell-bar').first()).toHaveAttribute('data-bar-index', '0');
  await expect(table.locator('tfoot tr')).toHaveCount(1);
  await expect(table.locator('tfoot tr')).toContainText('100%');
  await expect(table.locator('thead th').first()).toHaveCSS('position', 'sticky');
  await expect(card).toHaveAttribute('gs-w', '12');

  const headers = table.locator('thead th');
  await expect(headers.getByRole('button')).toHaveCount(9);
  const users = headers.filter({ hasText: /^Пользователи$/ });
  await users.getByRole('button').click();
  await expect(users).toHaveAttribute('aria-sort', 'ascending');
  const counts = async () =>
    (await table.locator('tbody tr td:nth-child(2)').allTextContents()).map((value) =>
      Number(value.replace(/\s/g, '')),
    );
  const ascending = await counts();
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
  expect(ascending[0]).toBeLessThan(ascending.at(-1));
  await users.getByRole('button').press('Enter');
  await expect(users).toHaveAttribute('aria-sort', 'descending');
  expect(await counts()).toEqual(ascending.reverse());
  await headers.first().getByRole('button').click();
  await expect(headers.first()).toHaveAttribute('aria-sort', 'ascending');
  await expect(users).not.toHaveAttribute('aria-sort');
  await expect(table.locator('tfoot tr')).toContainText('Итого');

  const maxBar = table.locator('.cell-bar[style="--bar-width: 100%;"]').first();
  await expect(maxBar).toHaveCSS('height', '24px');
  await expect(maxBar).toHaveCSS('background-size', 'calc(100% - 10px) calc(100% - 8px)');
  const scroll = card.locator('.table-view');
  await scroll.evaluate((element) => {
    element.style.maxHeight = '240px';
    element.scrollTop = 0;
  });
  await expect(table.locator('tfoot tr')).not.toBeInViewport();
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(table.locator('tfoot tr')).toBeInViewport();
});

test('C03 quarter is a per-card filter and the system renders a subtle inline C-ID', async ({
  page,
}) => {
  await ready(page);
  const c03 = page.locator('[data-instance-id="c03-initial"]');
  await expect(c03.locator('.widget-chart-id')).toHaveText('· C03');
  await expect(c03.locator('.widget-titles > p')).toHaveCount(0);
  await expect(page.locator('.widget-titles > p')).toHaveCount(0);
  const selector = c03.locator('.widget-filter-select');
  await expect(selector).toHaveCount(1);
  await expect(selector).toHaveValue('all');
  await c03.locator('.widget-table').click();
  await expect(c03.locator('tbody tr')).toHaveCount(24);
  await selector.selectOption('1');
  await expect(c03.locator('tbody tr')).toHaveCount(6, { timeout: 120000 });
  await expect(c03.locator('.widget-overlay:visible')).toHaveCount(0);
  await expect(page.locator('[data-instance-id="c18-initial"] canvas')).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('zetflix.view-filters.v1') || '{}')?.[
            'initial/c03-initial'
          ]?.quarter,
      ),
    )
    .toBe('1');
  await page.reload();
  await expect(page.locator('[data-instance-id="c03-initial"] .widget-filter-select')).toHaveValue(
    '1',
  );
  await expect(page.locator('[data-instance-id="c03-initial"] .widget-chart canvas')).toHaveCount(
    1,
  );
});

test('refresh controls recompute SQL while an ordinary reload restores cached rows', async ({
  page,
}) => {
  test.setTimeout(120000);
  await ready(page);
  const fetched = [];
  page.on('request', (request) => {
    if (/\.wasm(?:$|\?)|\.parquet(?:$|\?)/.test(request.url())) fetched.push(request.url());
  });
  await page.reload();
  await expect(page.locator('.widget-chart canvas')).toHaveCount(2);
  await expect(page.locator('.widget-overlay:visible')).toHaveCount(0);
  expect(fetched).toEqual([]);
  const single = page.locator('[data-instance-id="c03-initial"] .widget-refresh');
  await expect(single.locator('svg')).toHaveCount(1);
  await expect(single).toHaveText('');
  await page.locator('#edit-btn').click();
  await expect(single).toBeHidden();
  await save(page);
  await expect(page.locator('.widget-overlay:visible')).toHaveCount(0);
  await single.click();
  await expect(page.locator('.widget-overlay:visible')).toHaveCount(0);
  expect(fetched.some((url) => url.includes('pl_control.parquet'))).toBe(true);
  const all = page.getByRole('button', { name: 'Перезагрузить все графики' });
  await all.click();
  await expect(all).toBeEnabled();
  await expect(page.locator('.widget-overlay:visible')).toHaveCount(0);
  expect(fetched.some((url) => url.includes('ad_revenue.parquet'))).toBe(true);
});

test('one save synchronizes a second browser session without reloading', async ({ browser }) => {
  const remote = mockWorkspace();
  const other = await browser.newContext();
  const viewer = await other.newPage();
  await remote.install(viewer);
  await viewer.goto('./');
  await expect(viewer.locator('.grid-stack-item')).toHaveCount(2);
  const authorContext = await browser.newContext();
  const author = await authorContext.newPage();
  try {
    await remote.install(author);
    await author.goto('./');
    await author.locator('#edit-btn').click();
    await author.locator('#add-heading-btn').click();
    await author.locator('#heading-text').fill('Для команды');
    await author.locator('#heading-form button[type=submit]').click();
    await author.locator('#save-workspace').click();
    await expect(author.locator('.heading-title')).toHaveText('Для команды');
    await expect(viewer.locator('.heading-title')).toHaveCount(0);
    await author.locator('#github-token').fill('test-token');
    await author.locator('#sync-access button[type=submit]').click();
    await expect(author.locator('#edit-btn')).toBeEnabled();
    await expect(viewer.locator('.heading-title')).toHaveText('Для команды', { timeout: 30000 });
    expect(remote.writes()).toBe(1);
    expect(await author.evaluate(() => sessionStorage.getItem('zetflix.workspace-token.v1'))).toBe(
      'test-token',
    );
    await author.locator('#edit-btn').click();
    await author.locator('.heading-edit').click();
    await author.locator('#heading-text').fill('Обновлено');
    await author.locator('#heading-form button[type=submit]').click();
    await save(author);
    await expect(author.locator('#sync-access')).toBeHidden();
    expect(remote.writes()).toBe(2);
  } finally {
    await authorContext.close();
    await other.close();
  }
});

test('a lost save response is retried without another commit', async ({ page }) => {
  const remote = mockWorkspace();
  await remote.install(page);
  await page.goto('./');
  await page.locator('#edit-btn').click();
  await page.locator('#add-heading-btn').click();
  await page.locator('#heading-text').fill('Сохраняем повторно');
  await page.locator('#heading-form button[type=submit]').click();
  remote.loseNextResponse();
  await page.locator('#save-workspace').click();
  await expect(page.locator('#sync-status')).toHaveText(
    'Сохраним, когда связь с GitHub восстановится',
  );
  await expect(page.locator('.heading-title')).toHaveText('Сохраняем повторно');
  expect(remote.writes()).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#sync-notice')).toBeHidden();
  await expect(page.locator('#edit-btn')).toBeEnabled();
  expect(remote.writes()).toBe(1);
});

test('saved layouts reach sibling tabs and public availability is verified separately', async ({
  page,
  context,
}) => {
  const remote = mockWorkspace();
  const sibling = await context.newPage();
  await remote.install(page);
  await remote.install(sibling);
  // A sibling on a stalled connection must still receive the acknowledged local save.
  await sibling.route('https://**/workspace.json*', (route) => route.abort());
  await sibling.goto('./');
  await page.goto('./');
  await page.locator('#edit-btn').click();
  await page.locator('#add-heading-btn').click();
  await page.locator('#heading-text').fill('Общий макет');
  await page.locator('#heading-form button[type=submit]').click();
  remote.delayPublicRead();
  await save(page);
  await expect(page.locator('#sync-status')).toHaveText('Сохранено · проверяем доступность');
  await expect(sibling.locator('.heading-title')).toHaveText('Общий макет', { timeout: 5000 });
  remote.resumePublicRead();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#sync-status')).toHaveText('Доступно команде');
  await expect(page.locator('#sync-notice')).toBeHidden();
  expect(remote.writes()).toBe(1);
});

test('the chart library is separate from the add dialog and removes charts for the project', async ({
  page,
  context,
}) => {
  const remote = mockWorkspace();
  const sibling = await context.newPage();
  await remote.install(page);
  await remote.install(sibling);
  await page.setViewportSize({ width: 390, height: 844 });
  await sibling.goto('./');
  await page.goto('./');
  await page.locator('#nav-charts').click();
  await expect(page.locator('#dashboard-page')).toBeHidden();
  await expect(page.locator('#nav-charts')).toHaveAttribute('aria-current', 'page');
  const tiles = page.locator('.chart-library-tile');
  await expect(tiles).toHaveCount(5);
  await expect(page.locator('.chart-library-preview canvas')).toHaveCount(5);
  await expect(tiles.filter({ hasText: 'rfm' })).toContainText('Таблица');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#nav-dashboard').click();
  await page.locator('#edit-btn').click();
  await page.locator('#add-btn').click();
  await expect(page.locator('[data-chart-id="C20"]').first()).toContainText('C20 · RFM');
  await page.keyboard.press('Escape');
  await save(page);
  await page.locator('#nav-charts').click();
  await page.getByRole('button', { name: 'Удалить из проекта C03' }).click();
  await page.locator('#confirm-dialog button[value="confirm"]').click();
  await expect(tiles).toHaveCount(4);
  await expect(page.locator('#sync-notice')).toHaveClass(/sync-success/);
  await expect(sibling.locator('[data-instance-id="c03-initial"]')).toHaveCount(0);
  expect(remote.writes()).toBe(1);
  await page.reload();
  await expect(tiles).toHaveCount(4);
  await page.locator('#nav-dashboard').click();
  await page.locator('#edit-btn').click();
  await page.locator('#add-btn').click();
  await expect(page.locator('#catalog-items [data-chart-id="C03"]')).toHaveCount(0);
});

test('catalog copies a stable ID and shares display title changes with the dashboard', async ({
  page,
  context,
}) => {
  const remote = mockWorkspace();
  const sibling = await context.newPage();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await remote.install(page);
  await remote.install(sibling);
  await sibling.goto('./');
  await page.goto('./#charts');
  const navigation = page.getByRole('navigation', { name: 'Разделы проекта' });
  await expect(navigation.getByRole('link')).toHaveText(['Дашборд', 'Графики']);
  const ref = 'financial-trend';
  const copy = page.getByRole('button', { name: 'Копировать ID ' + ref });
  await copy.click();
  await expect(page.getByRole('button', { name: 'ID скопирован: ' + ref })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ref);
  await page.getByRole('button', { name: 'Переименовать ' + ref }).click();
  await page.getByLabel('Отображаемое название').fill('Финансовый обзор');
  await page.locator('#chart-name-form button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Финансовый обзор' })).toBeVisible();
  await expect(sibling.locator('[data-instance-id="c03-initial"] h3')).toHaveText(
    'Финансовый обзор',
  );
  expect(remote.writes()).toBe(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Финансовый обзор' })).toBeVisible();
  await expect(page.locator('.chart-library-id').filter({ hasText: ref })).toHaveCount(1);
  await page.locator('#nav-dashboard').click();
  await page.locator('#edit-btn').click();
  await page.locator('#add-btn').click();
  await expect(page.locator('#catalog-items [data-chart-id="C03"]')).toContainText(
    'Финансовый обзор',
  );
});
