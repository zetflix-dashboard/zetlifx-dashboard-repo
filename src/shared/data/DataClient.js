import { QueryCache } from './QueryCache.js';
import versions from 'virtual:parquet-versions';
import * as duckdb from '@duckdb/duckdb-wasm';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const BUNDLES = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

export class DataClient {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.starting = null;
    this.db = null;
    this.conn = null;
    this.worker = null;
    this.registered = new Map();
    this.tail = Promise.resolve();
    this.cache = new Map();
    this.cacheLimit = 40;
    this.persistent = new QueryCache(this.cacheLimit);
    this.closed = false;
  }

  async init() {
    if (this.closed) throw new Error('Data client is closed');
    if (this.conn) return this.conn;
    if (!this.starting) {
      this.onStatus('loading', 'Запуск DuckDB-Wasm…');
      this.starting = (async () => {
        const bundle = await duckdb.selectBundle(BUNDLES);
        this.worker = new Worker(bundle.mainWorker);
        this.db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), this.worker);
        await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        this.conn = await this.db.connect();
        this.onStatus('ready', 'DuckDB-Wasm · локальный SQL');
        return this.conn;
      })().catch((error) => {
        this.onStatus('error', 'Ошибка DuckDB-Wasm');
        this.starting = null;
        if (this.worker) this.worker.terminate();
        this.worker = null;
        throw error;
      });
    }
    return this.starting;
  }

  async ensureFile(name) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*\.parquet$/.test(name)) {
      throw new Error('Недопустимое имя Parquet-файла');
    }
    if (!this.registered.has(name)) {
      const promise = (async () => {
        const url = new URL(import.meta.env.BASE_URL + 'data/' + name, window.location.origin);
        if (versions[name]) url.searchParams.set('v', versions[name]);
        await this.db.registerFileURL(name, url.href, duckdb.DuckDBDataProtocol.HTTP, false);
      })();
      this.registered.set(name, promise);
      promise.catch(() => this.registered.delete(name));
    }
    return this.registered.get(name);
  }

  remember(key, rows) {
    this.cache.delete(key);
    this.cache.set(key, rows);
    if (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
  }

  query(files, sql, params = [], signal, { definition, force = false, validate } = {}) {
    if (this.closed) return Promise.reject(new Error('Data client is closed'));
    if (signal?.aborted) return Promise.reject(new DOMException('Query superseded', 'AbortError'));
    const key = JSON.stringify([
      definition,
      files.map((name) => [name, versions[name]]),
      sql,
      params,
      import.meta.env.VITE_DATA_VERSION || null,
    ]);
    const persist = files.every((name) => versions[name]);
    const assertCurrent = () => {
      if (signal?.aborted) throw new DOMException('Query superseded', 'AbortError');
    };
    const run = async () => {
      assertCurrent();
      if (!force) {
        const cached = this.cache.get(key) ?? (persist ? await this.persistent.read(key) : null);
        assertCurrent();
        if (Array.isArray(cached)) {
          this.remember(key, cached);
          return cached;
        }
      }
      await this.init();
      for (const name of files) await this.ensureFile(name);
      if (signal?.aborted) throw new DOMException('Query superseded', 'AbortError');
      let result;
      if (params.length) {
        const statement = await this.conn.prepare(sql);
        try {
          result = await statement.query(...params);
        } finally {
          await statement.close();
        }
      } else {
        result = await this.conn.query(sql);
      }
      // DuckDB-Wasm cannot reliably interrupt a running query. Discard stale results.
      assertCurrent();
      const raw = result.toArray().map((row) => row.toJSON());
      const rows = validate ? validate(raw) : raw;
      this.remember(key, rows);
      if (persist) await this.persistent.write(key, rows);
      return rows;
    };
    const pending = this.tail.then(run).catch(async (error) => {
      if (error.name !== 'AbortError') {
        // DuckDB may discard an HTTP file after a failed read while our URL
        // registration remains cached. Reset only this query's files, inside
        // the serial queue, so Retry can register them again safely.
        for (const name of files) {
          this.registered.delete(name);
          try {
            await this.db?.dropFile(name);
          } catch {
            /* A failed registration may already have removed the file. */
          }
        }
      }
      throw error;
    });
    this.tail = pending.catch(() => {});
    return pending;
  }

  clearCache() {
    this.tail = this.tail.then(async () => {
      this.cache.clear();
      await this.persistent.clear();
    });
    return this.tail;
  }

  async dispose() {
    this.closed = true;
    await this.tail;
    if (this.starting) {
      try {
        await this.starting;
      } catch {
        /* failed initialization */
      }
    }
    if (this.conn) await this.conn.close();
    if (this.db) await this.db.terminate();
    if (this.worker) this.worker.terminate();
    this.conn = null;
    this.db = null;
    this.worker = null;
  }
}
