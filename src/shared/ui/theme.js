import { createIcon } from './icons.js';

export const THEME_KEY = 'zetflix.theme';

export function resolveTheme(preference, prefersDark) {
  return preference === 'light' || preference === 'dark'
    ? preference
    : prefersDark
      ? 'dark'
      : 'light';
}

export function initTheme(button, onChange) {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const readPreference = () => {
    try {
      return window.localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  };
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    const destination = theme === 'dark' ? 'светлую' : 'тёмную';
    const label = 'Включить ' + destination + ' тему';
    button.replaceChildren(createIcon(theme === 'dark' ? 'sun' : 'moon'));
    button.setAttribute('aria-label', label);
    button.title = label;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#000000' : '#f4f3f0');
    onChange();
  };
  apply(resolveTheme(readPreference(), query.matches));
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Theme switching remains usable if browser storage is blocked.
    }
    apply(next);
  });
  query.addEventListener('change', () => {
    if (!['light', 'dark'].includes(readPreference())) apply(resolveTheme(null, query.matches));
  });
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY) apply(resolveTheme(event.newValue, query.matches));
  });
}
