import { createIcon } from '../ui/icons.js';

const types = {
  line: ['Линейная диаграмма', 'M10 55 32 31 48 40 69 15 87 24'],
  bar: ['Столбчатая диаграмма', 'M15 55V39H29V55ZM42 55V24H56V55ZM69 55V12H83V55Z'],
  combo: [
    'Комбинированная диаграмма',
    'M15 55V42H29V55ZM42 55V35H56V55ZM69 55V31H83V55ZM12 27 32 14 51 22 85 9',
  ],
  scatter: [
    'Точечная диаграмма',
    'M18 48h1m10-14h1m3 12h1m11-20h1m7 9h1m9-17h1m7 24h1m8-31h1m5 15h1',
  ],
  pie: ['Круговая диаграмма', 'M47 31V7a24 24 0 1 0 24 24H47ZM55 8v15h15A21 21 0 0 0 55 8Z'],
  table: ['Таблица', 'M12 10H84V56H12ZM12 25H84M12 41H84M36 10V56M60 10V56'],
  tree: ['Дерево', 'M10 9H86V57H10ZM47 9V57M47 32H86M67 9V32M67 32V57M10 39H47'],
  waterfall: [
    'Каскадная диаграмма',
    'M10 53V40H23V53ZM31 40V27H44V40ZM52 27V13H65V27ZM73 53V13H86V53ZM23 40H31M44 27H52M65 13H73',
  ],
  funnel: ['Воронка', 'M13 10H83L74 22H22ZM26 29H70L61 41H35ZM40 48H56L51 57H45Z'],
  heatmap: ['Тепловая карта', 'M14 9H82V55H14ZM31 9V55M48 9V55M65 9V55M14 24H82M14 40H82'],
  indicator: ['Индикатор', 'M13 11H83V55H13ZM29 41 43 27 53 34 68 22M57 22H68V33'],
  sankey: [
    'Диаграмма перетоков',
    'M11 10V28M11 39V55M85 10V24M85 32V55M15 15C47 15 48 39 81 39M15 23C47 23 48 17 81 17M15 47C47 47 48 49 81 49',
  ],
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function preview(template) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 132;
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.scale(2, 2);
  context.lineWidth = template === 'scatter' ? 5 : 2.8;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = '#4f9e8f';
  context.stroke(new Path2D(types[template][1]));
  return canvas;
}

function action(icon, label, onClick, disabled = false) {
  const button = element('button', 'chart-library-action');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(createIcon(icon));
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

export function renderChartLibrary(
  container,
  charts,
  { disabled, onRemove, onRename, onCopyError },
) {
  container.replaceChildren(
    ...charts.map((chart) => {
      const tile = element('article', 'chart-library-tile');
      const visual = element('div', 'chart-library-preview');
      visual.append(preview(chart.template));
      const information = element('div', 'chart-library-info');
      const title = element('h2', 'chart-library-title', chart.title);
      const type = element('p', 'chart-library-type', types[chart.template][0]);
      const identity = element('div', 'chart-library-identity');
      const id = element('code', 'chart-library-id', chart.ref);
      const label = 'Копировать ID ' + chart.ref;
      let timer;
      const copy = action('copy', label, async () => {
        try {
          await navigator.clipboard.writeText(chart.ref);
          clearTimeout(timer);
          copy.replaceChildren(createIcon('check'));
          copy.setAttribute('aria-label', 'ID скопирован: ' + chart.ref);
          copy.title = 'ID скопирован';
          timer = setTimeout(() => {
            copy.replaceChildren(createIcon('copy'));
            copy.setAttribute('aria-label', label);
            copy.title = label;
          }, 1800);
        } catch {
          onCopyError(chart.ref);
        }
      });
      identity.append(id, copy);
      information.append(title, type, identity);
      const controls = element('div', 'chart-library-controls');
      const rename = action('edit', 'Переименовать ' + chart.ref, () => onRename(chart), disabled);
      const remove = action(
        'trash',
        'Удалить из проекта ' + chart.id,
        () => onRemove(chart),
        disabled,
      );
      remove.classList.add('danger');
      controls.append(rename, remove);
      tile.append(visual, information, controls);
      return tile;
    }),
  );
}
