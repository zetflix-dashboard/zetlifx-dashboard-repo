import { validateChart } from './contract.js';
import { galleryDatasets } from '../data/galleryDatasets.js';

const monthly = { dataset: 'galleryMonthly', dimension: 'period' };
const definitions = [
  {
    ...monthly,
    template: 'line',
    title: 'Динамика подписчиков',
    question: 'Как меняется число подписчиков каждого тарифа по месяцам?',
    series: [{ field: 'standard' }, { field: 'premium' }],
  },
  {
    ...monthly,
    template: 'bar',
    title: 'Выручка по месяцам',
    question: 'В какие месяцы выручка была выше?',
    series: [{ field: 'revenue' }],
  },
  {
    ...monthly,
    template: 'combo',
    title: 'Выручка и маржа',
    question: 'Как меняется маржа на фоне роста выручки?',
    series: [
      { field: 'revenue', type: 'bar' },
      { field: 'margin', type: 'line' },
    ],
  },
  {
    dataset: 'galleryContent',
    template: 'scatter',
    title: 'Лицензии и просмотры',
    question: 'Как связаны стоимость лицензии и часы просмотра тайтла?',
    dimension: 'hours',
    pointLabel: 'title',
    series: [{ field: 'cost' }],
  },
  {
    dataset: 'galleryMix',
    template: 'pie',
    title: 'Просмотры по жанрам',
    question: 'Какая доля часов просмотра приходится на каждый жанр?',
    dimension: 'genre',
    series: [{ field: 'hours' }],
  },
  {
    dataset: 'galleryProfit',
    template: 'tree',
    title: 'Дерево операционной прибыли',
    question: 'Из каких статей складывается операционная прибыль?',
    dimension: 'node',
    parent: 'parent',
    pointLabel: 'label',
    series: [{ field: 'amount' }],
  },
  {
    dataset: 'galleryBridge',
    template: 'waterfall',
    title: 'Мост прибыли с 2024 по 2025',
    question: 'Какие статьи изменили прибыль между двумя годами?',
    dimension: 'step',
    stepType: 'kind',
    series: [{ field: 'amount' }],
  },
  {
    dataset: 'galleryFunnel',
    template: 'funnel',
    title: 'Воронка подписки',
    question: 'Сколько пользователей проходит каждый этап от регистрации до третьей оплаты?',
    dimension: 'stage',
    series: [{ field: 'users' }],
  },
  {
    dataset: 'galleryRetention',
    template: 'heatmap',
    title: 'Удержание по когортам',
    question: 'Какая доля подписчиков остаётся в каждом месяце жизни когорты?',
    dimension: 'age',
    category: 'cohort',
    series: [{ field: 'rate' }],
  },
  {
    dataset: 'galleryMonthly',
    template: 'table',
    title: 'Месячные показатели',
    question: 'Как сравнить показатели отдельных месяцев и общую выручку?',
    columns: ['period', 'standard', 'premium', 'revenue', 'margin'],
    columnBars: ['standard', 'premium', 'revenue', 'margin'],
    totals: ['revenue'],
  },
];

export const galleryCharts = new Map(
  definitions.map((raw, i) => {
    const chart = validateChart({ id: 'C' + (90 + i), ...raw }, galleryDatasets);
    const id = 'gallery-' + chart.template;
    return [id, { ...chart, id, gallery: true, minSize: { w: 4, h: 4 } }];
  }),
);

export const gallerySpace = {
  title: 'Все типы графиков',
  widgets: [...galleryCharts].map(([id, chart], index) => ({
    instanceId: id,
    chartId: id,
    x: index < 8 ? (index % 2) * 6 : 0,
    y: index < 8 ? Math.floor(index / 2) * 5 : index === 8 ? 20 : 25,
    w: ['heatmap', 'table'].includes(chart.template) ? 12 : 6,
    h: chart.template === 'table' ? 4 : 5,
  })),
};
