const field = (label, unit = 'text') => ({ label, unit });

function example(fields, values) {
  const keys = Object.keys(fields);
  return {
    label: 'Демонстрационные данные',
    limitation: 'Вымышленные значения для просмотра шаблона.',
    filters: [],
    fields,
    rows: values.map((row) => Object.fromEntries(keys.map((key, i) => [key, row[i]]))),
  };
}

const retention = [
  [100, 76, 65, 57, 52, 48],
  [100, 79, 68, 60, 55, null],
  [100, 73, 64, 55, null, null],
  [100, 81, 69, null, null, null],
  [100, 77, null, null, null, null],
  [100, null, null, null, null, null],
];

export const galleryDatasets = {
  galleryMonthly: example(
    {
      period: field('Месяц', 'month'),
      standard: field('Базовые подписчики', 'number'),
      premium: field('Премиум-подписчики', 'number'),
      revenue: field('Выручка', 'rub'),
      margin: field('Маржа', 'percent'),
    },
    [
      ['2025-01', 12400, 6200, 4830000, 14.2],
      ['2025-02', 13100, 6650, 5120000, 15.4],
      ['2025-03', 13650, 6900, 5410000, 12.8],
      ['2025-04', 13200, 7240, 5330000, 11.6],
      ['2025-05', 14800, 7710, 5880000, 17.2],
      ['2025-06', 15500, 8290, 6310000, 19.4],
    ],
  ),
  galleryContent: example(
    {
      title: field('Тайтл'),
      hours: field('Часы просмотра', 'number'),
      cost: field('Стоимость лицензии', 'rub'),
    },
    [
      ['Линия прибоя', 62000, 780000],
      ['Северный вокзал', 148000, 1240000],
      ['Короткий метр', 34000, 350000],
      ['Точка на карте', 85000, 1190000],
      ['Последняя станция', 120000, 910000],
      ['Утро на крыше', 54000, 610000],
      ['Ночной эфир', 105000, 1420000],
      ['На краю города', 76000, 570000],
      ['Обратный билет', 176000, 1620000],
    ],
  ),
  galleryMix: example({ genre: field('Жанр'), hours: field('Часы просмотра', 'number') }, [
    ['Драма', 322000],
    ['Комедия', 231000],
    ['Триллер', 149000],
    ['Документальное', 106000],
  ]),
  galleryProfit: example(
    {
      node: field('ID узла'),
      parent: field('ID родителя'),
      label: field('Статья'),
      amount: field('Сумма', 'rub'),
    },
    [
      ['profit', null, 'Опер. прибыль', 1200000],
      ['revenue', 'profit', 'Чистая выручка', 6300000],
      ['subscriptions', 'revenue', 'Подписки', 4100000],
      ['advertising', 'revenue', 'Реклама', 1150000],
      ['rentals', 'revenue', 'Аренда', 650000],
      ['partners', 'revenue', 'Партнёры', 400000],
      ['cost', 'profit', 'Себестоимость', -3200000],
      ['licences', 'cost', 'Контент', -2750000],
      ['cdn', 'cost', 'CDN', -450000],
      ['opex', 'profit', 'Опер. расходы', -1900000],
      ['marketing', 'opex', 'Маркетинг', -1100000],
      ['support', 'opex', 'Поддержка', -800000],
    ],
  ),
  galleryBridge: example(
    { step: field('Шаг'), kind: field('Тип шага'), amount: field('Сумма', 'rub') },
    [
      ['2024', 'total', 740000],
      ['Подписки', 'delta', 870000],
      ['Реклама', 'delta', 310000],
      ['Контент', 'delta', -540000],
      ['Прочее', 'delta', -180000],
      ['2025', 'total', 1200000],
    ],
  ),
  galleryFunnel: example({ stage: field('Этап'), users: field('Пользователи', 'number') }, [
    ['Регистрация', 12000],
    ['Пробный период', 8400],
    ['Первая оплата', 4200],
    ['3-й месяц', 3100],
  ]),
  galleryRetention: example(
    {
      cohort: field('Месяц первой оплаты', 'month'),
      age: field('Месяц жизни', 'number'),
      rate: field('Удержание', 'percent'),
    },
    retention.flatMap((values, cohort) =>
      values.map((value, age) => ['2025-0' + (cohort + 1), age, value]),
    ),
  ),
};
