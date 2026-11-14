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
        const url = new URL(import.meta.env.BASE_URL + 'data/' + name, window.location.origin).href;
        await this.db.registerFileURL(name, url, duckdb.DuckDBDataProtocol.HTTP, false);
      })();
      this.registered.set(name, promise);
      promise.catch(() => this.registered.delete(name));
    }
    return this.registered.get(name);
  }

  query(files, sql, params = [], signal) {
    if (this.closed) return Promise.reject(new Error('Data client is closed'));
    if (signal?.aborted) return Promise.reject(new DOMException('Query superseded', 'AbortError'));
    const key = JSON.stringify([files, sql, params, import.meta.env.VITE_DATA_VERSION || 'snapshot-2025']);
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    const run = async () => {
      if (signal?.aborted) throw new DOMException('Query superseded', 'AbortError');
      if (this.cache.has(key)) return this.cache.get(key);
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
      if (signal?.aborted) throw new DOMException('Query superseded', 'AbortError');
      const rows = result.toArray().map((row) => row.toJSON());
      this.cache.set(key, rows);
      if (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
      return rows;
    };
    const pending = this.tail.then(run);
    this.tail = pending.catch(() => {});
    return pending;
  }

  clearCache() { this.cache.clear(); }

  async dispose() {
    this.closed = true;
    await this.tail;
    if (this.starting) {
      try { await this.starting; } catch { /* failed initialization */ }
    }
    if (this.conn) await this.conn.close();
    if (this.db) await this.db.terminate();
    if (this.worker) this.worker.terminate();
    this.conn = null;
    this.db = null;
    this.worker = null;
  }
}
