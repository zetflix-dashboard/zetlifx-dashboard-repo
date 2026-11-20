# Общие компоненты

Изменяются в общей задаче. `data/datasets.js` — экспорт автоматически собранных локальных источников. SQL и метаданные графика редактируются в его query.sql и chart.json. `data/queryContract.js` и `data/sources.json` — общая политика и список Parquet. `data/DataClient.js` — DuckDB/кеш; `filters` — механизмы фильтрации; `charts` — контракт и единый renderer; `ui` — общие форматы и контролы.
