# Каталог графиков, обязательность и приёмка

Источник: матрица C01–C24 из инструкции БПМ4. **C01–C23 обязательны; C24 дополнительный.** В начале каждой задачи Codex обязан открыть соответствующую строку и `docs/metrics.md`. Статус реализации: **все ещё не реализованы**, пока не смержен PR с работающим модулем и проверками. После merge обновить статус и ссылку на путь модуля.

| ID | Вопрос / ожидаемый визуал | Основные данные |
|---|---|---|
| C01 | Из чего операционный результат? Дерево прибыли | billing_events, partner_settlements, rentals, ad_revenue, refunds, cost_pools |
| C02 | Подписчики или ARPU? Декомпозиция по тарифам | billing_events, subscriptions |
| C03 | Выручка, прибыль, маржа по месяцам | pl_control или сверенные факты |
| C04 | Мост прибыли 2024→2025 по статьям | pl_control, cost_pools, content_amortization |
| C05 | Подписчики EOM, приток/отток PL1–PL3 | subscriptions, users |
| C06 | Эффект роста цен 01.03.2025 | price_history, billing_events, subscriptions |
| C07 | Воронка регистрации → trial → оплата → третий месяц | trials, users, acquisition_channels |
| C08 | CAC регистрации/платящего и окупаемость каналов | marketing_spend, users, subscriptions, billing_events |
| C09 | Когортный retention, будущие ячейки пустые | subscriptions, billing_events |
| C10 | Отток по причинам | subscriptions |
| C11 | Первая ошибка карты и спасение повтором | billing_events |
| C12 | PL3: ARPU, churn, платежи партнёров | partner_settlements, partner_payments, subscriptions, cost_allocations |
| C13 | «Город у реки»: регистрации, удержание, платежи | users, trials, subscriptions, viewing_daily, content_amortization, content_payments |
| C14 | Стоимость часа по тайтлам/жанрам | content_amortization, viewing_daily, content_titles |
| C15 | Доля часов оригиналов | viewing_daily, content_titles |
| C16 | Окупаемость тайтлов, топ/антитоп | content_amortization, viewing_daily, rentals, pl_control |
| C17 | Выручка и маржа аренды | rentals, content_titles, cost_allocations |
| C18 | Рекламная заполняемость, eCPM, доход PL1 | ad_inventory, ad_revenue, viewing_daily |
| C19 | Накопленная ценность 3/6/12 мес и оценка LTV | billing_events, rentals, refunds, users |
| C20 | RFM-матрица и доля выручки сегментов | viewing_daily, billing_events, users |
| C21 | ABC-затраты и неиспользованная мощность | cost_pools, cost_drivers, cost_allocations |
| C22 | Прибыль→деньги, задолженности, выплаты | cash_control, content_payments, partner_payments, ad_payments, store_settlements |
| C23 | Качество и сверка PL/Cash, исключения | pl_control, cash_control, users, billing_events |
| C24 (optional) | Сценарии цены Премиум 399/429/469 | price_history, billing_events, subscriptions |

## Глобальные фильтры
Период, тариф, канал привлечения, канал оплаты, партнёр, регион, устройство. **Не все фильтры осмысленны для каждой метрики.** Для каждого C-ID указывай поддерживаемые и неприменимые фильтры, со ссылкой на доказанную цепочку данных; никогда не имитируй разрез общей P&L по устройствам без модели распределения.

## Definition of Done для каждого C-ID
1. Отвечает вопросу руководителя; подписи на русском, деньги RUB, проценты %, понятные единицы и метод расчёта.
2. Использует общий контракт и реестр, общие фильтры/тему/SQL-слой; не имеет дублированной бизнес-формулы.
3. Явно документированы источники, зерно, роль даты, исключения, неприменимые фильтры, ограничения доказательности.
4. Проверены default, 2 применимых фильтра (если есть), пустой результат, ошибка, разный период и контрольный числовой срез.
5. Не размножает факты; не изменяет соседние графики; проходит общие тесты и ревью.
6. В PR указывается реальная проверка и обновляется статус после merge.

## Финальная аналитическая сдача
Схема связей, определения метрик с датами/исключениями, PL и Cash сверка, минимум 3 вывода и 3 действия. Формат каждого действия: **сигнал → предлагаемое действие → KPI проверки → ограничение причинной интерпретации**. Дополнительно допустимы сценарии второго сезона сериала (24 месяца) и трёх цен Премиум.
