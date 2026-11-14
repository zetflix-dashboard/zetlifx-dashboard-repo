# Правила разработки отдельных графиков

Сначала прочти `../../AGENTS.md` и `../../docs/agent-modes.md`. **По умолчанию одна задача = один C-ID = одна директория `src/charts/CXX-*/`.** Тесты и локальные ресурсы графика находятся здесь же. Не меняй другие графики, `src/shared`, `src/layout`, `src/main.js`, `src/style.css`, `src/dashboards`, `docs`, `.github`, `package.json` или этот AGENTS.md. В BATCH разрешены только явно перечисленные C-ID. Для изменения оболочки нужен отдельный явный ADMIN.

## Контракт действующего приложения
- Экспорт `default` из `index.js`: уникальный `id`, `title`, `subtitle`, `supportedFilters`, `defaultSize`, `minSize`, асинхронный `load({filters,query,signal})` и `option(rows)` для ECharts.
- `query(files,sql,params)` принимает список разрешённых Parquet-имён, параметризованный SQL и параметры; возвращает массив агрегированных строк. Используй общий shared data API и форматирование, не поднимай свой DuckDB worker.
- `ChartRegistry` обнаруживает `src/charts/*/index.js` автоматически; AutoCharts показывает новый C-ID в сетке. Не меняй оболочку/макет для регистрации.
- График не управляет собственными DOM-позициями и global filters. Не дублируй формулы KPI, контролируй даты, зерно и JOIN. Нельзя выводить неподдерживаемый разрез как истинный.
- Текущий ChartManager централизованно управляет loading/error/empty, resize и dispose. Если для графика требуется новая серия ECharts, попроси отдельную ADMIN-задачу на регистрацию.

## Приёмка
Перед SQL прочти `docs/charts.md`, `docs/metrics.md`, `docs/dataset.md` и проверь фактическую Parquet-схему. Тестируй числовой результат, граничные периоды и применимые фильтры. В PR помести один scope-блок (или оставь CHART неуказанным) и укажи, что не менял чужие C-ID и движок.
