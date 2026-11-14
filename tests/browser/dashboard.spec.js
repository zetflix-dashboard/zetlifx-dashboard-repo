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
  await page.selectOption('#period-to', '2024-01');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first().locator('td').nth(1)).not.toHaveText('—');
  await page.locator('#filters-reset').click();
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
