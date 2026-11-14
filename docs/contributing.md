# Разработка и автоматическое слияние

## Рабочий цикл
1. Свежий main → отдельная ветка `chart/CXX-description` или `admin/description`.
2. Прочитать AGENTS.md, выбрать область и выполнить задачу. Коммитить и push автоматически, без отдельного запроса подтверждения.
3. `npm ci`, `npm run check`, `npm run test:e2e`. Перед browser-тестом установить Chromium; `check` уже собирает Pages-вариант.
4. Создать PR с блоком ZETFLIX_SCOPE и результатами. Для chart — ровно один каталог и только JSON/README. Для admin — описание совместимости, миграций и проверок общего кода.
5. После успешных проверок последнего SHA агент самостоятельно сливает PR (если пользователь не запросил только черновик/ревью). Проверить, что head не изменился. При новых изменениях main обновить ветку и повторить проверки интеграции. Никогда не обходить красный CI или GitHub restrictions.

Ручное review не является обязательным правилом проекта. PR нужен как проверяемый diff и точка запуска CI, а не как обязательная кнопка одобрения человеком. Не писать напрямую в main и не force-push общую ветку.

## Рекомендуемая настройка GitHub (отдельно от файлов)
На момент аудита 2026-11-14 main был `protected: false`, rulesets отсутствовали. Изменение файла workflow не включает защиту ветки.

Для main создать активное правило:
- Require a pull request before merging; required approvals = 0 (без обязательного человеческого review).
- Require status checks `scope` (workflow Scope changes) и `check` (workflow Check dashboard), требовать актуальную базу.
- Запретить force push и удаление main. Не задавать обходы для обычной разработки.
- По желанию включить Allow auto-merge в General. Тогда агент включает auto-merge PR и GitHub ждёт checks. Если настройки auto-merge недоступны, агент может дождаться checks и выполнить обычный merge с проверкой head SHA.

Проверка scope доверяет коду base-ветки: `pull_request_target` используется только для чтения diff, никогда для установки зависимостей/запуска кода PR. Первое добавление scope workflow начнёт работать после merge в main; это явная bootstrap-граница. Build/browser job работает на PR merge ref с read-only правами.

Не добавлять workflow, который автоматически выполняет любой admin-PR с write-token. Режим admin — декларация намерения, не подтверждение полномочий. Для автоматического merge остаются GitHub-права, заданная пользователем область работы и успешные проверки.

## Ограничения среды
Инструкции репозитория не отключают системные подтверждения Codex, ограничения подключения и защиты GitHub. Если текущий инструмент не может менять repository settings, это сообщается явно; наличие документа не выдаётся за включённый ruleset.

## Источники практик
- [GitHub: auto-merge](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)
- [GitHub: branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [W3C: вкладки](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [ECharts: доступность](https://echarts.apache.org/handbook/en/best-practices/aria/)
