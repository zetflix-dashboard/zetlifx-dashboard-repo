const NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  undo: [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10a6 6 0 0 1 0 12h-2' }]],
  redo: [['path', { d: 'm15 14 5-5-5-5' }], ['path', { d: 'M20 9H10a6 6 0 0 0 0 12h2' }]],
  info: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 10v6m0-9h.01' }],
  ],
  grip: [
    ['circle', { cx: 9, cy: 5, r: 1.5 }],
    ['circle', { cx: 15, cy: 5, r: 1.5 }],
    ['circle', { cx: 9, cy: 12, r: 1.5 }],
    ['circle', { cx: 15, cy: 12, r: 1.5 }],
    ['circle', { cx: 9, cy: 19, r: 1.5 }],
    ['circle', { cx: 15, cy: 19, r: 1.5 }],
  ],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    [
      'path',
      {
        d: 'M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42',
      },
    ],
  ],
  moon: [['path', { d: 'M20.985 12.486A9 9 0 0 1 11.514 3.015a9 9 0 1 0 9.47 9.47Z' }]],
};

export function createIcon(name) {
  if (!Object.hasOwn(ICONS, name)) throw new Error('Неизвестная иконка');
  const svg = document.createElementNS(NS, 'svg');
  for (const [attr, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: 18,
    height: 18,
    'aria-hidden': 'true',
    focusable: 'false',
    fill: name === 'grip' ? 'currentColor' : 'none',
    stroke: name === 'grip' ? 'none' : 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }))
    svg.setAttribute(attr, String(value));
  for (const [tag, attributes] of ICONS[name]) {
    const shape = document.createElementNS(NS, tag);
    for (const [attr, value] of Object.entries(attributes)) shape.setAttribute(attr, String(value));
    svg.append(shape);
  }
  return svg;
}
