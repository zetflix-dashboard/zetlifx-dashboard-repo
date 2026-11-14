# Редактор дашборда: реализованный контракт

## Запуск
Node.js ≥20.19; из корня репозитория: \`npm install\`, \`npm run dev\`; \`npm run check\` для тестов и сборки. Для Pages: \`npm run build:pages\` (base \`/zetlifx-dashboard-repo/\`). Деплой на GitHub Pages **не** активирован автоматически.

## Файлы и ответственность
- \`src/main.js\`: сборка страницы, кнопки, текущий dashboard ID «overview».
- \`src/layout/GridManager.js\`: GridStack, карточки, drag/resize, удаление и положение.
- \`src/layout/LayoutStorage.js\`: проверка структуры, версия, localStorage, JSON export/import, Undo/Redo.
- \`src/dashboards/overview.json\`: общий стандартный макет, изменяется через PR.
- \`src/shared/charts/ChartRegistry.js\`: автоподключение \`src/charts/*/index.js\` через Vite glob.
- \`src/shared/charts/ChartManager.js\`: экземпляры ECharts, загрузка, повторные расчеты при смене фильтра и освобождение ресурсов.
- \`src/shared/filters/FilterStore.js\`: пока реализован общий период (2024-01..2025-12). Остальные фильтры недоступны, а не имитируются по агрегированным контрольным данным.
- \`src/shared/data/DataClient.js\`: один DuckDB-Wasm worker и одна connection на вкладку, сериализация запросов, подготовленные параметры, кеш и регистрация Parquet по требованию.

## Контракт одного графика
Создать \`src/charts/CXX-name/index.js\` с default export: \`id\`, \`title\`, \`subtitle\`, \`supportedFilters\`, \`defaultSize\`, \`minSize\`, \`load({filters,query,signal})\`, \`option(rows)\`. \`query(files,sql,params)\` возвращает массив агрегированных объектов. \`option(rows)\` возвращает конфигурацию ECharts. GridManager отвечает за положение, ChartManager за mount/refresh/resize/dispose. Код самого графика не обращается ни к GridStack, ни к DOM, ни к новому экземпляру DuckDB. Внутренний ECharts допускает types LineChart и BarChart; новые типы зарегистрировать в ChartManager отдельным PR.

## Сохранение
В режиме «Настроить макет» можно перемещать карточки за ручку, растягивать за угол, добавлять/удалять, Undo/Redo, сохранять в localStorage, экспортировать или импортировать JSON. Состояние макета не затрагивает SQL. Общий макет редактируется в \`src/dashboards/overview.json\` через PR. Импорт валидирует chartId, instanceId, координаты, габариты и версию; неизвестные графики отклоняются. LocalStorage привязан к конкретному браузеру, не синхронизируется с другими пользователями.

## Два рабочих примера
- **C03:** PL_Control — месячные \`net_revenue\`, \`operating_profit\`, производная маржа; методология из инструкции. Источник \`public/data/pl_control.parquet\`; тестовые исключены в подготовленном контроле; другие разрезы в таблице отсутствуют.
- **C18:** Ad_Inventory и Ad_Revenue — заполняемость sold/available и взвешенный eCPM по выручке и проданным показам. Дата \`period\`. Ни один график не выдаёт недоступные разрезы за реальные.

## Ограничения и будущие задачи
Здесь нет Supabase, авторизации, автоматической публикации или полной реализации всех C01–C24. Загрузка данных выполняется в браузере; GitHub Pages публикует любые файлы \`public/data/\`. Обязательно проверить после деплоя чтение WASM/worker и Range-запросы к Parquet. Для 32 таблиц и глубоких разрезов нужны отдельные измерения, поддержка фильтров по доказанным связям, проверки JOIN и предагрегаты. DuckDB-Wasm не гарантирует прерывание уже исполняемого запроса: результат отменённого UI-запроса просто отбрасывается.
