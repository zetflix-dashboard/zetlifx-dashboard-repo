# Разработка и автоматическое слияние

## Рабочий цикл
1. Свежий main → отдельная ветка `chart/CXX-description` или `admin/description`.
2. Прочитать AGENTS.md, выбрать область и выполнить задачу. По постоянному разрешению пользователя сразу коммитить, отправлять изменения в публичный репозиторий `zetflix-dashboard/zetlifx-dashboard-repo` и создавать PR без отдельного подтверждения публикации исходников. После успешных обязательных проверок выполнять слияние и публикацию сайта по правилам ниже. Учитывать явные исключения пользователя: локальная работа, без публикации, только черновик/ревью.
3. `npm ci`, `npm run check`, `npm run test:e2e`. Перед browser-тестом установить Chromium; `check` уже собирает Pages-вариант.
4. Создать PR с блоком ZETFLIX_SCOPE и результатами. Для chart — ровно один каталог и только JSON/README. Для admin — описание совместимости, миграций и проверок общего кода.
5. После успешных проверок последнего SHA агент самостоятельно сливает PR (если пользователь не запросил только черновик/ревью). Проверить, что head не изменился. При новых изменениях main обновить ветку и повторить проверки интеграции. Никогда не обходить красный CI или GitHub restrictions.

Ручное review не является обязательным правилом проекта. PR нужен как проверяемый diff и точка запуска CI, а не как обязательная кнопка одобрения человеком. Не писать напрямую в main и не force-push общую ветку.

## GitHub для кода и общего макета

Для main применяются правила из `.github/main-ruleset.json`. Код проходит `scope`, `check` и очередь слияния. `scope` выполняет код из базового коммита и читает diff как данные. `check` валидирует резервный макет по каталогу, собирает сайт и запускает тесты. Playwright использует фиксированный макет из `tests/fixtures/workspace.json`.

Рабочий `workspace.json` находится в корне ветки `workspace-sync`. Сохранение в редакторе обновляет только этот файл прямым коммитом. Правила PR и триггеры Actions для main на эту ветку не распространяются. Для переноса в отдельный публичный репозиторий задайте при сборке `VITE_WORKSPACE_REPOSITORY` в формате `owner/name` и `VITE_WORKSPACE_BRANCH`, предварительно скопировав туда актуальный файл.

## Ограничения среды
Инструкции репозитория не отключают системные подтверждения Codex, ограничения подключения и защиты GitHub. Если текущий инструмент не может менять repository settings, это сообщается явно; наличие документа не выдаётся за включённый ruleset.

## Источники практик
- [GitHub: auto-merge](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)
- [GitHub: branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [W3C: вкладки](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [ECharts: доступность](https://echarts.apache.org/handbook/en/best-practices/aria/)


## Готовая конфигурация защиты
В `.github/main-ruleset.json` сохранён ruleset с очередью слияния, двумя required checks, нулём обязательных approvals и запретом force-push/удаления main. Он подготовлен, но не применяется самим наличием в репозитории. После merge workflow и появления обоих checks администратор может выполнить из checkout:

```sh
gh api --method POST repos/zetflix-dashboard/zetlifx-dashboard-repo/rulesets --input .github/main-ruleset.json
gh api --method PATCH repos/zetflix-dashboard/zetlifx-dashboard-repo -F allow_auto_merge=true
```

Эти шаги также доступны в GitHub Settings → Rules → Rulesets (импорт JSON) и Settings → General → Pull Requests. Нужен уже авторизованный GitHub CLI с Administration:write; токены в файлы не помещать. При существующем одноимённом ruleset обновлять его по ID, а не создавать копию. [Схема GitHub API](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset).
