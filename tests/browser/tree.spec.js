import { test, expect } from '@playwright/test';
import { treeOption } from '../../src/shared/charts/specializedOptions.js';
import { chartTheme } from '../../src/shared/charts/templates.js';

// Exercise the production ECharts tree with a bounded test dataset; no chart is
// registered or inserted into a user's saved workspace for these tests.
for (const width of [900, 390]) {
  test(`tree tiles pan across a ${width}px viewport and show node descriptions`, async ({
    page,
  }) => {
    const definition = {
      dimension: 'id',
      parent: 'parent',
      pointLabel: 'label',
      description: 'description',
      series: [{ field: 'amount' }],
      trend: { period: 'period', periods: 3 },
    };
    const rows = ['2025-01-01', '2025-02-01', '2025-03-01'].flatMap((period, index) => [
      {
        id: 'root',
        parent: null,
        label: 'Прибыль',
        description: 'Доходы минус расходы',
        period,
        amount: 100 + index * 20,
      },
      {
        id: 'revenue',
        parent: 'root',
        label: 'Выручка',
        description: 'Доход за месяц',
        period,
        amount: 200 + index * 10,
      },
      {
        id: 'cost',
        parent: 'root',
        label: 'Расходы',
        description: 'Затраты за месяц',
        period,
        amount: 100 - index * 10,
      },
    ]);
    const option = treeOption(definition, rows, { amount: { unit: 'rub' } }, chartTheme());
    const annotate = (node) => {
      node.testLabel = option.series[0].label.formatter({ data: node });
      node.testTooltip = option.tooltip.formatter({ data: node });
      node.children.forEach(annotate);
    };
    option.series[0].data.forEach(annotate);
    // Callbacks have already been exercised above with their production closures.
    const serializable = JSON.parse(JSON.stringify(option));
    await page.setViewportSize({ width, height: 600 });
    await page.goto('./');
    await page.setContent('<div id="tree" style="width:100%;height:450px"></div>');
    await page.addScriptTag({ path: 'node_modules/echarts/dist/echarts.min.js' });
    await page.evaluate((option) => {
      window.tree = window.echarts.init(document.querySelector('#tree'));
      option.animation = false;
      option.tooltip.renderMode = 'html';
      option.tooltip.formatter = ({ data }) => data.testTooltip;
      option.series[0].label.formatter = ({ data }) => data.testLabel;
      option.series[0].leaves.label.formatter = ({ data }) => data.testLabel;
      window.tree.setOption(option);
    }, serializable);
    const positions = await page.evaluate(() => {
      const series = window.tree.getModel().getSeriesByIndex(0);
      const data = series.getData();
      return {
        root: data.getItemLayout(1),
        child: data.getItemLayout(2),
        x: window.tree
          .getZr()
          .storage.getDisplayList()
          .find((el) => el.type === 'image').transform[4],
      };
    });
    expect(positions.child.y).toBeGreaterThan(positions.root.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await page.locator('#tree').boundingBox();
    // The root is centered and i sits at the top-right of its 216px tile.
    await page.mouse.move(box.x + box.width / 2 + 88, box.y + 34);
    await expect(page.getByText(/Доходы минус расходы/)).toBeVisible();
    await page.mouse.move(box.x + box.width / 2, box.y + 68);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + 110, { steps: 8 });
    await page.mouse.up();
    const moved = await page.evaluate(
      () =>
        window.tree
          .getZr()
          .storage.getDisplayList()
          .find((el) => el.type === 'image').transform[4],
    );
    expect(moved).toBeLessThan(positions.x - 60);
  });
}
