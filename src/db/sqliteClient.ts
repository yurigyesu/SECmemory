import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { SqlExecutor, SqlParam } from './types';

const IDB_NAME = 'secmemory-sqlite-store';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'active-db-v1';

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
let activeDb: Database | null = null;

function getInitSqlJsFn(): typeof initSqlJs {
  const candidate = initSqlJs as unknown as { default?: typeof initSqlJs };
  if (typeof initSqlJs === 'function') return initSqlJs;
  if (typeof candidate.default === 'function') return candidate.default;
  throw new Error('Failed to resolve sql.js initializer');
}

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const baseUrl = import.meta.env.BASE_URL || './';
    const init = getInitSqlJsFn();
    sqlJsPromise = init({
      locateFile: (file: string) => `${baseUrl}wasm/${file}`,
      useOldExtensionFunctions: false,
    });
  }
  return sqlJsPromise;
}

function openSnapshotStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function loadSnapshot(): Promise<Uint8Array | null> {
  try {
    const idb = await openSnapshotStore();
    return await new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result;
        resolve(val instanceof Uint8Array ? val : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveSnapshot(bytes: Uint8Array): Promise<void> {
  try {
    const idb = await openSnapshotStore();
    await new Promise<void>((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore storage quota or private-mode IndexedDB errors gracefully
  }
}

async function clearSnapshot(): Promise<void> {
  try {
    const idb = await openSnapshotStore();
    await new Promise<void>((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

async function fetchBundledBytes(): Promise<Uint8Array> {
  const baseUrl = import.meta.env.BASE_URL || './';
  const response = await fetch(`${baseUrl}db/secmemory.sqlite`);
  if (!response.ok) {
    throw new Error(`SQLite DB 파일 로드 실패 (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

function readSchemaMeta(db: Database): { schemaVersion: string | null; builtAt: string | null } {
  try {
    const stmt = db.prepare('SELECT key, value FROM db_metadata WHERE key IN (?, ?)');
    stmt.bind(['schema_version', 'built_at']);
    const map = new Map<string, string>();
    while (stmt.step()) {
      const row = stmt.getAsObject() as { key?: string; value?: string };
      if (row.key && row.value) map.set(row.key, row.value);
    }
    stmt.free();
    return {
      schemaVersion: map.get('schema_version') ?? null,
      builtAt: map.get('built_at') ?? null,
    };
  } catch {
    return { schemaVersion: null, builtAt: null };
  }
}

function wrapDatabase(db: Database): SqlExecutor {
  return {
    queryAll<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return rows;
    },
    queryOne<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T | null {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const found = stmt.step() ? (stmt.getAsObject() as T) : null;
      stmt.free();
      return found;
    },
    execute(sql: string, params: SqlParam[] = []): void {
      if (params.length > 0) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        stmt.step();
        stmt.free();
      } else {
        db.run(sql);
      }
    },
  };
}

export async function initBrowserDb(): Promise<SqlExecutor> {
  const SQL = await getSqlJs();
  const bundledBytes = await fetchBundledBytes();
  const bundledDb = new SQL.Database(bundledBytes);
  const bundledMeta = readSchemaMeta(bundledDb);

  const savedBytes = await loadSnapshot();
  if (savedBytes) {
    try {
      const savedDb = new SQL.Database(savedBytes);
      const savedMeta = readSchemaMeta(savedDb);
      if (
        savedMeta.schemaVersion === bundledMeta.schemaVersion &&
        savedMeta.builtAt === bundledMeta.builtAt
      ) {
        bundledDb.close();
        activeDb?.close();
        activeDb = savedDb;
        return wrapDatabase(activeDb);
      }
      savedDb.close();
    } catch {
      // Fall back to fresh bundled DB
    }
  }

  activeDb?.close();
  activeDb = bundledDb;
  return wrapDatabase(activeDb);
}

export async function persistDb(): Promise<void> {
  if (!activeDb) return;
  const bytes = activeDb.export();
  await saveSnapshot(bytes);
}

export function exportSqliteUint8Array(): Uint8Array {
  if (!activeDb) {
    throw new Error('SQLite 데이터베이스가 아직 초기화되지 않았습니다.');
  }
  return activeDb.export();
}

export async function importSqliteUint8Array(bytes: Uint8Array): Promise<SqlExecutor> {
  const SQL = await getSqlJs();
  const candidate = new SQL.Database(bytes);
  // Validate expected SECmemory core table exists
  const check = wrapDatabase(candidate).queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'families'",
  );
  if (!check) {
    candidate.close();
    throw new Error('유효한 SECmemory SQLite 데이터베이스 파일이 아닙니다.');
  }
  activeDb?.close();
  activeDb = candidate;
  await saveSnapshot(bytes);
  return wrapDatabase(activeDb);
}

export async function resetToBundledDb(): Promise<SqlExecutor> {
  await clearSnapshot();
  const SQL = await getSqlJs();
  const bundledBytes = await fetchBundledBytes();
  activeDb?.close();
  activeDb = new SQL.Database(bundledBytes);
  return wrapDatabase(activeDb);
}
