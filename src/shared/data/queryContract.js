const identifier = /^[a-z_][a-z0-9_]*$/i;
const reserved = ['__proto__', 'constructor', 'prototype'];
const functions = new Set(
  `read_parquet unnest generate_series range cast try_cast sum avg min max count
 coalesce nullif abs round floor ceil ceiling greatest least date_part date_trunc date_diff last_day
 strftime strptime try_strptime extract lower upper trim replace concat concat_ws substring substr length
 left right row_number rank dense_rank lag lead first_value last_value ntile percent_rank cume_dist
 median quantile_cont quantile_disc stddev stddev_samp variance bool_and bool_or string_agg list
 list_distinct list_count array_length typeof if isnan isfinite sqrt pow power log ln exp sign mod
 date_add date_sub make_date year month day`.split(/\s+/),
);
const syntax = new Set(
  'as in over filter exists values select from join on using partition by not and or when then else case where having with recursive distinct all'.split(
    ' ',
  ),
);
const forbidden = new Set(
  `insert update delete create drop alter truncate copy attach detach install load
 export import pragma call set reset vacuum checkpoint use grant revoke merge prepare execute deallocate
 summarize pivot unpivot into`.split(/\s+/),
);

function object(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('Некорректное описание данных');
}
const label = (value, max = 1000) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function validateData(data, sources) {
  object(data, [
    'label',
    'sources',
    'grain',
    'dateRole',
    'filters',
    'localFilters',
    'limitation',
    'fields',
  ]);
  for (const key of ['label', 'grain', 'dateRole', 'limitation']) {
    if (!label(data[key])) throw new Error('Нужно описание данных: ' + key);
  }
  if (
    !Array.isArray(data.sources) ||
    !data.sources.length ||
    new Set(data.sources).size !== data.sources.length ||
    data.sources.some((name) => typeof name !== 'string' || !sources.includes(name))
  ) {
    throw new Error('Разрешены только Parquet из общего справочника');
  }
  if (
    !Array.isArray(data.filters) ||
    data.filters.length > 1 ||
    data.filters.some((id) => id !== 'period')
  )
    throw new Error('Неизвестный общий фильтр');
  if (
    !data.fields ||
    typeof data.fields !== 'object' ||
    Array.isArray(data.fields) ||
    !Object.keys(data.fields).length ||
    Object.keys(data.fields).length > 50
  )
    throw new Error('Нужны поля результата запроса');
  for (const [name, field] of Object.entries(data.fields)) {
    object(field, ['label', 'unit']);
    if (
      !identifier.test(name) ||
      reserved.includes(name) ||
      !label(field.label, 160) ||
      !['text', 'month', 'number', 'rub', 'percent'].includes(field.unit)
    )
      throw new Error('Некорректное поле результата');
  }
  if (data.localFilters !== undefined && !Array.isArray(data.localFilters))
    throw new Error('Некорректные фильтры');
  const filters = data.localFilters || [];
  if (filters.length > 4 || new Set(filters.map((f) => f?.id)).size !== filters.length)
    throw new Error('Некорректные фильтры');
  for (const filter of filters) {
    object(filter, ['id', 'label', 'options']);
    if (
      !identifier.test(filter.id) ||
      reserved.includes(filter.id) ||
      !label(filter.label, 160) ||
      !Array.isArray(filter.options) ||
      !filter.options.length ||
      filter.options.length > 100 ||
      new Set(filter.options.map((o) => o?.value)).size !== filter.options.length
    )
      throw new Error('Некорректный локальный фильтр');
    for (const option of filter.options) {
      object(option, ['value', 'label']);
      if (!label(option.value, 160) || !label(option.label, 160))
        throw new Error('Некорректная опция фильтра');
    }
  }
  return data;
}

// Conservative lexical policy, not a general SQL parser or security sandbox.
export function sqlTokens(sql) {
  if (typeof sql !== 'string' || !sql.trim() || sql.length > 30000)
    throw new Error('Некорректный SQL');
  const tokens = [];
  const pattern =
    /\s+|--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|[a-z_][a-z0-9_]*|\d+(?:\.\d+)?|[(),.;?*+\-\/%=<>!|\[\]]/giy;
  let pos = 0;
  while (pos < sql.length) {
    pattern.lastIndex = pos;
    const match = pattern.exec(sql);
    if (!match) throw new Error('Неподдерживаемый синтаксис SQL');
    pos = pattern.lastIndex;
    const token = match[0];
    if (sql.startsWith('/*', pos - token.length) && !token.endsWith('*/'))
      throw new Error('Незавершённый SQL-комментарий');
    if (/^\s|^--|^\/\*/.test(token)) continue;
    if (token.startsWith("'"))
      tokens.push({ type: 'string', value: token.slice(1, -1).replaceAll("''", "'") });
    else if (token.startsWith('"')) {
      const name = token.slice(1, -1).replaceAll('""', '"');
      if (!identifier.test(name)) throw new Error('Разрешены простые SQL-идентификаторы');
      tokens.push({ type: 'identifier', value: name.toLowerCase() });
    } else
      tokens.push({ type: identifier.test(token) ? 'word' : 'symbol', value: token.toLowerCase() });
  }
  return tokens;
}
export function validateQuery(sql, data) {
  const tokens = sqlTokens(sql);
  if (tokens.at(-1)?.type === 'symbol' && tokens.at(-1)?.value === ';') tokens.pop();
  if (
    !['select', 'with'].includes(tokens[0]?.value) ||
    tokens.some((t) => t.value === ';' && t.type === 'symbol')
  )
    throw new Error('SQL должен содержать один SELECT или WITH … SELECT');
  const read = new Set();
  let parameters = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'symbol' && t.value === '?') parameters++;
    if (t.type === 'string') {
      if (
        ['from', 'join'].includes(tokens[i - 1]?.value) ||
        (/(?:\.parquet|https?:|file:|s3:|[\\/])/.test(t.value) &&
          tokens[i - 2]?.value !== 'read_parquet')
      )
        throw new Error('Чтение только через read_parquet');
      continue;
    }
    if (!['word', 'identifier'].includes(t.type)) continue;
    if (forbidden.has(t.value)) throw new Error('SQL допускает только чтение: ' + t.value);
    if (tokens[i + 1]?.value !== '(') continue;
    if (
      tokens[i - 1]?.value === '.' ||
      (!functions.has(t.value) && !syntax.has(t.value) && tokens[i - 1]?.value !== 'as')
    )
      throw new Error('Неподдерживаемая SQL-функция: ' + t.value);
    if (t.value === 'read_parquet') {
      const file = tokens[i + 2];
      if (
        file?.type !== 'string' ||
        tokens[i + 3]?.value !== ')' ||
        !data.sources.includes(file.value)
      )
        throw new Error('read_parquet требует одно имя разрешённого Parquet');
      read.add(file.value);
    }
  }
  if (data.sources.some((file) => !read.has(file)))
    throw new Error('sources должен совпадать с читаемыми Parquet');
  const expected = (data.filters.includes('period') ? 2 : 0) + (data.localFilters || []).length;
  if (parameters !== expected) throw new Error('Число SQL-параметров не совпадает с фильтрами');
  return sql;
}
