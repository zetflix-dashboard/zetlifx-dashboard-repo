import { test, expect } from '@playwright/test';
const key = 'zetflix.workspaces.v2';
test.beforeEach(async ({ page }) => {
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
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key))?.spaces.length, key))
    .toBe(2);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Контент' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.grid-stack-item')).toHaveCount(1);
  await page.locator('.app-menu summary').click();
  await page.locator('#rename-space').click();
  await page.locator('#space-name').fill('Финансы');
  await page.locator('#space-form').getByRole('button', { name: 'Сохранить' }).click();
  await page.locator('#delete-space').click();
  await page.locator('#confirm-dialog button[value="confirm"]').click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.locator('#edit-btn').click();
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
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key))?.spaces[0].widgets[0].h, key),
    )
    .toBe(6);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#dashboard-grid')).toHaveClass(/gs-1\b/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.locator('#edit-btn').click();
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.reload();
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
  await expect(page.locator('#empty-layout')).toBeVisible();
  await expect(page.locator('.grid-stack-item')).toHaveCount(0);
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
  await page.locator('#edit-btn').click();
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
  await page.locator('#edit-btn').click();
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
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) || 'null')?.spaces?.[0]?.widgets?.find(
            (w) => w.type === 'heading',
          )?.title,
        key,
      ),
    )
    .toBe('Важные показатели');
  await page.locator('.heading-edit').click();
  await page.locator('#heading-text').fill('Экономика подписок');
  await page.locator('#heading-form button[type="submit"]').click();
  await expect(page.locator('.heading-title')).toHaveText('Экономика подписок');
  await page.locator('#undo-btn').click();
  await expect(page.locator('.heading-title')).toHaveText('Важные показатели');
  await page.locator('#edit-btn').click();
  await expect(page.locator('.heading-controls')).toBeHidden();
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
  await page.locator('#edit-btn').click();
  await expect(selector).toHaveValue('Драма');
  await expect(page.locator('.widget-chart canvas')).toHaveCount(3);
  await page.reload();
  await expect(cards.locator('.widget-filter-select')).toHaveValue('Драма');
});

test('RFM table is compact, includes only three metric bars and a totals row', async ({ page }) => {
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
          JSON.parse(
            localStorage.getItem('zetflix.workspaces.v2') || 'null',
          )?.spaces?.[0]?.widgets?.find((w) => w.chartId === 'C03')?.localFilters?.quarter,
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
