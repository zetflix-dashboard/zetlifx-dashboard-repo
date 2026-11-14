import { MIN_MONTH, MAX_MONTH, validateFilters } from '../filters/FilterStore.js';

const formatter = new Intl.DateTimeFormat('ru-RU', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthLabel = (month) =>
  formatter.format(new Date(month + '-01T00:00:00Z')).replace(' г.', '');
const months = [];
for (let year = Number(MIN_MONTH.slice(0, 4)); year <= Number(MAX_MONTH.slice(0, 4)); year++) {
  for (let m = 1; m <= 12; m++) {
    const value = year + '-' + String(m).padStart(2, '0');
    if (value >= MIN_MONTH && value <= MAX_MONTH) months.push(value);
  }
}
export function initPeriodPicker(root, filters, onError = () => {}) {
  const trigger = root.querySelector('#period-trigger');
  const panel = root.querySelector('#period-panel');
  const grid = root.querySelector('#period-months');
  const step = root.querySelector('#period-step');
  const apply = root.querySelector('#period-apply');
  const cancel = root.querySelector('#period-cancel');
  let from;
  let to;
  let selectingEnd = false;
  let initialFocus = null;

  function syncLabel() {
    const current = filters.get();
    trigger.textContent = monthLabel(current.periodFrom) + ' — ' + monthLabel(current.periodTo);
    trigger.setAttribute('aria-expanded', String(!panel.hidden));
  }
  function render() {
    grid.replaceChildren();
    for (const year of [...new Set(months.map((month) => month.slice(0, 4)))]) {
      const section = document.createElement('section');
      section.className = 'period-year';
      const heading = document.createElement('h3');
      heading.textContent = year;
      section.append(heading);
      const cells = document.createElement('div');
      cells.className = 'period-month-grid';
      for (const month of months.filter((value) => value.startsWith(year))) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
          .format(new Date(month + '-01T00:00:00Z'))
          .replace('.', '');
        button.dataset.month = month;
        button.className = 'period-month';
        const selected = month === from || month === to;
        button.classList.toggle('is-endpoint', selected);
        button.classList.toggle('is-in-range', month > from && month < to);
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute('aria-label', monthLabel(month));
        button.addEventListener('click', () => {
          if (!selectingEnd) {
            from = month;
            to = month;
            selectingEnd = true;
          } else {
            if (month < from) {
              to = from;
              from = month;
            } else {
              to = month;
            }
            selectingEnd = false;
          }
          render();
        });
        cells.append(button);
      }
      section.append(cells);
      grid.append(section);
    }
    step.textContent = selectingEnd
      ? 'Выберите последний месяц'
      : 'Выберите первый месяц или готовый период';
  }
  function open() {
    const current = filters.get();
    from = current.periodFrom;
    to = current.periodTo;
    selectingEnd = false;
    initialFocus = document.activeElement;
    panel.hidden = false;
    render();
    syncLabel();
    grid.querySelector('[data-month="' + from + '"]')?.focus();
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    selectingEnd = false;
    syncLabel();
    (initialFocus?.isConnected ? initialFocus : trigger).focus();
  }
  trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
  cancel.addEventListener('click', close);
  apply.addEventListener('click', () => {
    try {
      filters.set(validateFilters({ periodFrom: from, periodTo: to }));
      close();
    } catch (error) {
      onError(error.message);
    }
  });
  root.querySelectorAll('[data-period-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = button.dataset.periodPreset;
      if (preset === 'all') {
        from = MIN_MONTH;
        to = MAX_MONTH;
      } else {
        from = preset + '-01';
        to = preset + '-12';
      }
      selectingEnd = false;
      render();
    });
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      close();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !root.contains(event.target)) close();
  });
  filters.subscribe(syncLabel);
  syncLabel();
  return { close, syncLabel };
}
