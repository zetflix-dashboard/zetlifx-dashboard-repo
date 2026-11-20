# Справочник датасета и бизнес-правила

**Первоисточник:** предоставленная командой «Инструкция.html» («Видеостриминг: учебный датасет БПМ4»). Данные целиком синтетические, вымышленный сервис «Кинополка», проектный бренд «Зетфликс». Период анализа: 2024–2025; история событий с 01.10.2023; срез 31.12.2025. Всего **32 таблицы / 1 428 430 строк / 258 полей** по описанию источника. В репозитории хранятся версии Parquet в `public/data/`; фактическая Parquet-схема проверяется при написании SQL. Эта сводка **не заменяет полный словарь 258 полей первоисточника**; полный оригинал инструкции следует добавить в `docs/reference/Инструкция.html`.

## Таблицы: имя Parquet → зерно / первичный ключ
| Файл | Зерно / первичный ключ |
|---|---|
| calendar | день / date |
| plans | тариф / plan_id |
| price_history | цена по интервалу / price_id |
| acquisition_channels | канал привлечения / acquisition_channel_id |
| billing_channels | канал оплаты / billing_channel_id |
| partners | партнёр / partner_id |
| users | аккаунт / user_id |
| trials | бесплатный пробный период / trial_id |
| subscriptions | период подписки на тарифе / subscription_id |
| billing_events | попытка списания / event_id |
| refunds | возврат успешного списания / refund_id |
| store_settlements | магазин × месяц / settlement_id |
| partner_settlements | партнёр × месяц / settlement_id |
| partner_payments | платёж партнёра / partner_payment_id |
| licensors | правообладатель / licensor_id |
| content_titles | фильм или сериал / title_id |
| content_licenses | договор на тайтл / license_id |
| content_amortization | тайтл × месяц / amortization_id |
| content_payments | платёж за контент / content_payment_id |
| viewing_daily | пользователь × тайтл × день / view_id |
| rentals | покупка 48-часовой аренды / rental_id |
| advertisers | рекламодатель / advertiser_id |
| ad_inventory | месяц / period |
| ad_revenue | рекламодатель × месяц / ad_revenue_id |
| ad_payments | оплата рекламной строки / ad_payment_id |
| marketing_spend | канал × месяц / marketing_id |
| cost_pools | пул затрат × месяц / pool_id |
| cost_drivers | тариф × пул / driver_id |
| cost_allocations | аллокация / allocation_id |
| expense_payments | оплата пула / expense_payment_id |
| pl_control | месяц / period |
| cash_control | месяц / period |

## Основные связи и запрет JOIN-размножения
Users.user_id ← Trials, Subscriptions, Billing_Events, Viewing_Daily, Rentals; Subscriptions.subscription_id ← Billing_Events, Viewing_Daily; Content_Titles.title_id ← Viewing_Daily, Rentals, Content_Amortization; Partners.partner_id ← Users, Subscriptions, Partner_Settlements; Cost_Pools.pool_id ← Cost_Drivers, Cost_Allocations, Expense_Payments; Partner_Settlements.settlement_id ← Partner_Payments; Ad_Revenue.ad_revenue_id ← Ad_Payments; Billing_Events.event_id ← Refunds. Calendar.date имеет **разные роли**: событие, оплаченный период, просмотр, счёт, расчётный месяц, выплата. Множественные факты предварительно агрегировать отдельно; отсутствие дублей ключа проверять программно.

## Основные бизнес-правила из инструкции
1. PL1 — Базовый с рекламой; PL2 — Премиум; PL3 — партнёрский оптовый доступ; PL4 — разовая 48-часовая аренда.
2. Пробный период 7 дней и бесплатен. Тестовые аккаунты `Users.is_test` / события `Billing_Events.is_test` не входят в коммерческие KPI.
3. Месячная оплата признаётся выручкой в месяц списания; годовая — равномерно по 12 месяцам. Возврат уменьшает выручку месяца возврата. Не путать признание выручки и фактическое движение денег.
4. Партнёр платит оптом за каждого абонента PL3, активного хотя бы один день месяца; пользователь не платит. Источник дохода — Partner_Settlements.
5. Аренда признаётся в день покупки. Половина цены принадлежит правообладателю, выплаты — поквартально. Рекламный доход признаётся по месяцу показов только PL1.
6. С 01.03.2025 повышены цены PL1/PL2; для старых подписчиков новая цена со следующего списания. После отказа карты повторы через 3 и 7 дней; три отказа закрывают подписку.
7. Комиссия магазинов не уменьшает выручку: это себестоимость. Поступления от магазинов идут за вычетом комиссии с задержкой 45 дней.
8. Фиксированные лицензии амортизируются линейно; оригиналы — 40% за первые 3 месяца и 60% за следующие 21. Денежные платежи за контент не равны амортизации.
9. ABC: контент по просмотрам подписки; CDN по часам с учетом мощности; поддержка по активным аккаунтам с учетом мощности. Неиспользованная мощность отдельной строкой. Маркетинг, разработка, управление не распределять.
10. Когорты — месяц первой платной подписки, будущие ячейки NULL. RFM: только прямые пользователи с успешной оплатой 2024–2025, срез 31.12.2025, без тестовых и партнеров.

## Типы / имена / версии
Имя файла — snake_case; один Parquet на одну таблицу. ID = текст, деньги = точные decimal, пустота = NULL, даты = date, локальное время = timestamp с задокументированной семантикой. Исходный CSV (если когда-либо понадобится): UTF-8 BOM, `;`, десятичная точка, bool true/false. Изменение снимка фиксировать в PR: схема/строки/размер/checksum, дата выгрузки, влияние на контролируемые KPI. Публичность `public/data` обязательна к проверке до деплоя.

## Фактические поля Parquet

Схемы считаны непосредственно из файлов `public/data` 20.11.2026. Типы — DuckDB; это технический справочник, семантика и роль дат описаны выше и в `docs/metrics.md`. Nullable в DESCRIBE не доказывает отсутствие NULL в фактах.


### acquisition_channels.parquet

| Поле | Тип |
|---|---|
| `acquisition_channel_id` | `VARCHAR` |
| `channel_name` | `VARCHAR` |
| `payment_model` | `VARCHAR` |

### ad_inventory.parquet

| Поле | Тип |
|---|---|
| `period` | `DATE` |
| `available_impressions` | `BIGINT` |
| `sold_impressions` | `BIGINT` |
| `fill_rate` | `DOUBLE` |

### ad_payments.parquet

| Поле | Тип |
|---|---|
| `ad_payment_id` | `VARCHAR` |
| `ad_revenue_id` | `VARCHAR` |
| `payment_date` | `DATE` |
| `amount` | `DECIMAL(18,2)` |

### ad_revenue.parquet

| Поле | Тип |
|---|---|
| `ad_revenue_id` | `VARCHAR` |
| `advertiser_id` | `VARCHAR` |
| `period` | `DATE` |
| `impressions` | `BIGINT` |
| `ecpm` | `DECIMAL(18,2)` |
| `revenue` | `DECIMAL(18,2)` |
| `invoice_date` | `DATE` |
| `due_date` | `DATE` |

### advertisers.parquet

| Поле | Тип |
|---|---|
| `advertiser_id` | `VARCHAR` |
| `advertiser_name` | `VARCHAR` |
| `industry` | `VARCHAR` |
| `buyer_type` | `VARCHAR` |
| `payment_terms_days` | `BIGINT` |
| `contract_start_date` | `DATE` |

### billing_channels.parquet

| Поле | Тип |
|---|---|
| `billing_channel_id` | `VARCHAR` |
| `channel_name` | `VARCHAR` |
| `store_commission_rate` | `DOUBLE` |
| `acquiring_fee_rate` | `DOUBLE` |

### billing_events.parquet

| Поле | Тип |
|---|---|
| `event_id` | `VARCHAR` |
| `subscription_id` | `VARCHAR` |
| `user_id` | `VARCHAR` |
| `plan_id` | `VARCHAR` |
| `billing_channel_id` | `VARCHAR` |
| `event_date` | `DATE` |
| `attempt_number` | `BIGINT` |
| `event_type` | `VARCHAR` |
| `event_status` | `VARCHAR` |
| `decline_reason` | `VARCHAR` |
| `list_price` | `DECIMAL(18,2)` |
| `attempted_amount` | `DECIMAL(18,2)` |
| `charged_amount` | `DECIMAL(18,2)` |
| `service_period_start` | `DATE` |
| `service_period_end` | `DATE` |
| `store_commission_rate` | `DOUBLE` |
| `store_commission` | `DECIMAL(18,2)` |
| `is_test` | `BOOLEAN` |

### calendar.parquet

| Поле | Тип |
|---|---|
| `date` | `DATE` |
| `year` | `BIGINT` |
| `quarter` | `BIGINT` |
| `month_number` | `BIGINT` |
| `month_name` | `VARCHAR` |
| `iso_week` | `BIGINT` |
| `weekday_number` | `BIGINT` |
| `weekday_name` | `VARCHAR` |
| `is_weekend` | `BOOLEAN` |
| `is_analysis_period` | `BOOLEAN` |
| `is_after_cutoff` | `BOOLEAN` |

### cash_control.parquet

| Поле | Тип |
|---|---|
| `period` | `DATE` |
| `receipts_card` | `DECIMAL(18,2)` |
| `receipts_stores` | `DECIMAL(18,2)` |
| `receipts_partners` | `DECIMAL(18,2)` |
| `receipts_ads` | `DECIMAL(18,2)` |
| `content_payments` | `DECIMAL(18,2)` |
| `expense_payments` | `DECIMAL(18,2)` |
| `net_cash_flow` | `DECIMAL(18,2)` |
| `deferred_revenue_balance` | `DECIMAL(18,2)` |
| `store_receivable_balance` | `DECIMAL(18,2)` |
| `partner_receivable_balance` | `DECIMAL(18,2)` |
| `ad_receivable_balance` | `DECIMAL(18,2)` |
| `ad_overdue_balance` | `DECIMAL(18,2)` |
| `content_paid_less_amortized_balance` | `DECIMAL(18,2)` |
| `rental_share_payable_balance` | `DECIMAL(18,2)` |
| `expense_payable_balance` | `DECIMAL(18,2)` |

### content_amortization.parquet

| Поле | Тип |
|---|---|
| `amortization_id` | `VARCHAR` |
| `title_id` | `VARCHAR` |
| `license_id` | `VARCHAR` |
| `period` | `DATE` |
| `amortization_method` | `VARCHAR` |
| `amortization_amount` | `DECIMAL(18,2)` |

### content_licenses.parquet

| Поле | Тип |
|---|---|
| `license_id` | `VARCHAR` |
| `title_id` | `VARCHAR` |
| `licensor_id` | `VARCHAR` |
| `license_type` | `VARCHAR` |
| `license_start` | `DATE` |
| `license_end` | `DATE` |
| `term_months` | `BIGINT` |
| `fee_amount` | `DECIMAL(18,2)` |
| `revenue_share_rate` | `DOUBLE` |
| `is_exclusive` | `BOOLEAN` |

### content_payments.parquet

| Поле | Тип |
|---|---|
| `content_payment_id` | `VARCHAR` |
| `payment_date` | `DATE` |
| `payment_type` | `VARCHAR` |
| `title_id` | `VARCHAR` |
| `licensor_id` | `VARCHAR` |
| `period_start` | `DATE` |
| `amount` | `DECIMAL(18,2)` |

### content_titles.parquet

| Поле | Тип |
|---|---|
| `title_id` | `VARCHAR` |
| `title_name` | `VARCHAR` |
| `content_type` | `VARCHAR` |
| `genre` | `VARCHAR` |
| `origin` | `VARCHAR` |
| `availability` | `VARCHAR` |
| `platform_release_date` | `DATE` |
| `production_year` | `BIGINT` |
| `episodes` | `BIGINT` |
| `runtime_hours` | `DOUBLE` |
| `rental_price` | `DECIMAL(18,2)` |
| `licensor_id` | `VARCHAR` |
| `production_budget` | `DECIMAL(18,2)` |

### cost_allocations.parquet

| Поле | Тип |
|---|---|
| `allocation_id` | `VARCHAR` |
| `pool_id` | `VARCHAR` |
| `driver_id` | `VARCHAR` |
| `plan_id` | `VARCHAR` |
| `allocation_status` | `VARCHAR` |
| `allocated_amount` | `DECIMAL(18,2)` |

### cost_drivers.parquet

| Поле | Тип |
|---|---|
| `driver_id` | `VARCHAR` |
| `pool_id` | `VARCHAR` |
| `plan_id` | `VARCHAR` |
| `driver_quantity` | `DOUBLE` |

### cost_pools.parquet

| Поле | Тип |
|---|---|
| `pool_id` | `VARCHAR` |
| `period` | `DATE` |
| `cost_category` | `VARCHAR` |
| `cost_layer` | `VARCHAR` |
| `allocation_method` | `VARCHAR` |
| `driver_name` | `VARCHAR` |
| `driver_unit` | `VARCHAR` |
| `pool_amount` | `DECIMAL(18,2)` |
| `capacity_quantity` | `DOUBLE` |
| `driver_total` | `DOUBLE` |
| `allocation_rate` | `DOUBLE` |

### expense_payments.parquet

| Поле | Тип |
|---|---|
| `expense_payment_id` | `VARCHAR` |
| `pool_id` | `VARCHAR` |
| `payment_date` | `DATE` |
| `amount` | `DECIMAL(18,2)` |

### licensors.parquet

| Поле | Тип |
|---|---|
| `licensor_id` | `VARCHAR` |
| `licensor_name` | `VARCHAR` |
| `licensor_type` | `VARCHAR` |

### marketing_spend.parquet

| Поле | Тип |
|---|---|
| `marketing_id` | `VARCHAR` |
| `period` | `DATE` |
| `acquisition_channel_id` | `VARCHAR` |
| `spend` | `DECIMAL(18,2)` |
| `spend_type` | `VARCHAR` |

### partner_payments.parquet

| Поле | Тип |
|---|---|
| `partner_payment_id` | `VARCHAR` |
| `settlement_id` | `VARCHAR` |
| `payment_date` | `DATE` |
| `amount` | `DECIMAL(18,2)` |

### partner_settlements.parquet

| Поле | Тип |
|---|---|
| `settlement_id` | `VARCHAR` |
| `partner_id` | `VARCHAR` |
| `period` | `DATE` |
| `billed_subscribers` | `BIGINT` |
| `rate_per_subscriber` | `DECIMAL(18,2)` |
| `amount` | `DECIMAL(18,2)` |
| `invoice_date` | `DATE` |
| `due_date` | `DATE` |

### partners.parquet

| Поле | Тип |
|---|---|
| `partner_id` | `VARCHAR` |
| `partner_name` | `VARCHAR` |
| `partner_type` | `VARCHAR` |
| `program_start_date` | `DATE` |
| `payment_terms_days` | `BIGINT` |

### pl_control.parquet

| Поле | Тип |
|---|---|
| `period` | `DATE` |
| `revenue_subscriptions` | `DECIMAL(18,2)` |
| `revenue_partners` | `DECIMAL(18,2)` |
| `revenue_rentals` | `DECIMAL(18,2)` |
| `revenue_ads` | `DECIMAL(18,2)` |
| `refunds` | `DECIMAL(18,2)` |
| `net_revenue` | `DECIMAL(18,2)` |
| `content_amortization` | `DECIMAL(18,2)` |
| `rental_licensor_share` | `DECIMAL(18,2)` |
| `video_delivery` | `DECIMAL(18,2)` |
| `store_commissions` | `DECIMAL(18,2)` |
| `payment_fees` | `DECIMAL(18,2)` |
| `cost_of_revenue` | `DECIMAL(18,2)` |
| `gross_profit` | `DECIMAL(18,2)` |
| `support` | `DECIMAL(18,2)` |
| `marketing` | `DECIMAL(18,2)` |
| `product_development` | `DECIMAL(18,2)` |
| `admin` | `DECIMAL(18,2)` |
| `operating_expenses` | `DECIMAL(18,2)` |
| `operating_profit` | `DECIMAL(18,2)` |

### plans.parquet

| Поле | Тип |
|---|---|
| `plan_id` | `VARCHAR` |
| `plan_name` | `VARCHAR` |
| `plan_type` | `VARCHAR` |
| `has_ads` | `BOOLEAN` |
| `payer_ru` | `VARCHAR` |

### price_history.parquet

| Поле | Тип |
|---|---|
| `price_id` | `VARCHAR` |
| `plan_id` | `VARCHAR` |
| `partner_id` | `VARCHAR` |
| `billing_period` | `VARCHAR` |
| `valid_from` | `DATE` |
| `valid_to` | `DATE` |
| `price` | `DECIMAL(18,2)` |

### refunds.parquet

| Поле | Тип |
|---|---|
| `refund_id` | `VARCHAR` |
| `event_id` | `VARCHAR` |
| `refund_date` | `DATE` |
| `amount` | `DECIMAL(18,2)` |
| `reason` | `VARCHAR` |

### rentals.parquet

| Поле | Тип |
|---|---|
| `rental_id` | `VARCHAR` |
| `user_id` | `VARCHAR` |
| `title_id` | `VARCHAR` |
| `rental_datetime` | `TIMESTAMP` |
| `access_end_datetime` | `TIMESTAMP` |
| `billing_channel_id` | `VARCHAR` |
| `price` | `DECIMAL(18,2)` |
| `licensor_share_rate` | `DOUBLE` |
| `licensor_share_amount` | `DECIMAL(18,2)` |
| `store_commission_rate` | `DOUBLE` |
| `store_commission` | `DECIMAL(18,2)` |

### store_settlements.parquet

| Поле | Тип |
|---|---|
| `settlement_id` | `VARCHAR` |
| `billing_channel_id` | `VARCHAR` |
| `period` | `DATE` |
| `gross_sales` | `DECIMAL(18,2)` |
| `refunds` | `DECIMAL(18,2)` |
| `store_commission` | `DECIMAL(18,2)` |
| `net_payout` | `DECIMAL(18,2)` |
| `payout_date` | `DATE` |

### subscriptions.parquet

| Поле | Тип |
|---|---|
| `subscription_id` | `VARCHAR` |
| `user_id` | `VARCHAR` |
| `plan_id` | `VARCHAR` |
| `billing_period` | `VARCHAR` |
| `billing_channel_id` | `VARCHAR` |
| `partner_id` | `VARCHAR` |
| `trial_id` | `VARCHAR` |
| `start_date` | `DATE` |
| `start_reason` | `VARCHAR` |
| `end_date` | `DATE` |
| `end_reason` | `VARCHAR` |

### trials.parquet

| Поле | Тип |
|---|---|
| `trial_id` | `VARCHAR` |
| `user_id` | `VARCHAR` |
| `plan_id` | `VARCHAR` |
| `acquisition_channel_id` | `VARCHAR` |
| `trial_start_date` | `DATE` |
| `trial_end_date` | `DATE` |
| `is_converted` | `BOOLEAN` |
| `subscription_id` | `VARCHAR` |

### users.parquet

| Поле | Тип |
|---|---|
| `user_id` | `VARCHAR` |
| `registration_date` | `DATE` |
| `acquisition_channel_id` | `VARCHAR` |
| `partner_id` | `VARCHAR` |
| `signup_title_id` | `VARCHAR` |
| `account_type` | `VARCHAR` |
| `device_os` | `VARCHAR` |
| `main_device` | `VARCHAR` |
| `age_group` | `VARCHAR` |
| `region` | `VARCHAR` |
| `is_test` | `BOOLEAN` |

### viewing_daily.parquet

| Поле | Тип |
|---|---|
| `view_id` | `VARCHAR` |
| `view_date` | `DATE` |
| `user_id` | `VARCHAR` |
| `title_id` | `VARCHAR` |
| `access_type` | `VARCHAR` |
| `plan_id` | `VARCHAR` |
| `subscription_id` | `VARCHAR` |
| `trial_id` | `VARCHAR` |
| `rental_id` | `VARCHAR` |
| `device_type` | `VARCHAR` |
| `hours_watched` | `DOUBLE` |
| `ad_impressions` | `BIGINT` |

Итого: 32 файла, 258 полей в текущем снимке.
