const STORE = 'results';

export class QueryCache {
  constructor(limit, indexedDB = globalThis.indexedDB) {
    this.limit = limit;
    this.indexedDB = indexedDB;
  }

  async open() {
    if (!this.indexedDB) return null;
    this.opening ??= new Promise((resolve, reject) => {
      const req = this.indexedDB.open('zetflix-query-cache', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE).createIndex('accessed', 'accessed');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Кэш недоступен'));
    }).catch(() => null);
    return this.opening;
  }

  async transaction(operation) {
    const db = await this.open();
    if (!db) return undefined;
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error);
        operation(tx.objectStore(STORE), (value) => {
          result = value;
        });
      });
    } catch {
      return undefined;
    }
  }

  read(key) {
    return this.transaction((store, setResult) => {
      const req = store.get(key);
      req.onsuccess = () => {
        if (!req.result) return;
        store.put({ ...req.result, accessed: Date.now() }, key);
        setResult(req.result.rows);
      };
    });
  }

  write(key, rows) {
    return this.transaction((store) => {
      store.put({ rows, accessed: Date.now() }, key);
      const count = store.count();
      count.onsuccess = () => {
        let excess = count.result - this.limit;
        if (excess <= 0) return;
        const cursor = store.index('accessed').openCursor();
        cursor.onsuccess = () => {
          if (!cursor.result || excess-- <= 0) return;
          cursor.result.delete();
          cursor.result.continue();
        };
      };
    });
  }

  clear() {
    return this.transaction((store) => store.clear());
  }
}
