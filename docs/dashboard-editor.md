# Действующий контракт редактора дашборда

## Запуск и архитектура
`npm install && npm run dev`; `npm test`; `npm run build:pages` для GitHub Pages. Интерфейс: Vite + JS + GridStack + ECharts, SQL в DuckDB-Wasm над `public/data/*.parquet`. CI: `.github/workflows/check.yml`, `.github/workflows/scope.yml`, деплой `.github/workflows/deploy.yml`.

`src/main.js` — сборка страницы и фильтров, `src/layout/GridManager.js` — сетка, drag/resize и карточки, `src/layout/LayoutStorage.js` — сериализация, Undo/Redo и browser localStorage, `src/layout/AutoCharts.js` — автодобавление впервые увиденных графиков, `src/shared/charts/ChartRegistry.js` — `import.meta.glob` модулей, `src/shared/charts/ChartManager.js` — ECharts lifecycle, `src/shared/data/DataClient.js` — общий DuckDB worker/кеш/очередь. `src/dashboards/overview.json` задаёт стартовые позиции существующих графиков.

## Как добавить новый график без правок оболочки
В режиме CHART создайте **только** `src/charts/CXX-name/index.js` и, если нужен, `src/charts/CXX-name/chart.test.js`. Контракт default export: `id`, `title`, `subtitle`, `supportedFilters`, `defaultSize`, `minSize`, `load({filters,query,signal})`, `option(rows)`. `query(files, sql, params)` возвращает агрегированные данные из Parquet. Допустимы существующие зарегистрированные серии ECharts (Line/Bar); новый тип требует отдельного ADMIN.

Реестр автоматически подхватывает модуль. AutoCharts добавляет **новые** C-ID в конец сетки, не меняя `overview.json`. Уже известные/скрытые пользователем графики повторно не добавляются после сохранения. Стартовый шаблон макета и персональные позиции хранятся раздельно. При первом открытии после обновления может потребоваться нажать «Сохранить», чтобы закрепить удаление автоматически добавленной карточки.

## Редактирование пользователем
Режим «Настроить макет»: перемещение за ручку, resize, добавить/удалить, Undo/Redo, сохранить в localStorage, JSON импорт/экспорт. Изменение расположения не вызывает SQL. Сохранение списка уже увиденных C-ID не позволяет удалённой карточке вернуться при следующей загрузке. Общие макеты меняются только в ADMIN через PR.

## Реализованные примеры
- `C03`: PL_Control, revenue / operating profit / margin; `C18`: Ad_Inventory и Ad_Revenue, fill rate и eCPM.
- Общий фильтр периода доступен. Тариф/регион в этих контрольных агрегатах неприменимы, поэтому UI не предлагает ложную фильтрацию.

## Ограничения
Parquet из `public/` публикуются открыто; деплой доступен только после настройки GitHub Pages. Проверки сборки не заменяют живой browser smoke test. Уточняйте фактическую схему перед новыми SQL. Новый C-ID не требует правок обёртки, но новый движковый функционал — ADMIN.
