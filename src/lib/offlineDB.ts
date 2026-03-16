/**
 * Ronin Offline — IndexedDB abstraction
 *
 * Stores pending mutations that could not reach Supabase because the device
 * was offline. The sync engine in `useOfflineSync` drains this queue whenever
 * connectivity returns.
 *
 * Schema (v1)
 * ───────────
 * mutation_queue  — ordered list of writes (insert / update / delete)
 */

const DB_NAME    = "ronin-offline";
const DB_VERSION = 1;
const STORE      = "mutation_queue";

export type MutationOp = "insert" | "update" | "delete";

export interface PendingMutation {
  /** Client-generated id so we can deduplicate on flush */
  id: string;
  /** Supabase table name */
  table: string;
  op: MutationOp;
  /** Row data for insert/update; primary key fields for delete */
  payload: Record<string, unknown>;
  /** Additional WHERE conditions for update/delete (optional) */
  filter?: Record<string, unknown>;
  created_at: string;
  retries: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath = id (our own uuid), autoIncrement = false
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function storeOp<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx    = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req   = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      }),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Push a new mutation onto the queue. Returns its id. */
export async function enqueue(
  table: string,
  op: MutationOp,
  payload: Record<string, unknown>,
  filter?: Record<string, unknown>,
): Promise<string> {
  const id = crypto.randomUUID();
  const mutation: PendingMutation = {
    id,
    table,
    op,
    payload,
    filter,
    created_at: new Date().toISOString(),
    retries: 0,
  };
  await storeOp("readwrite", s => s.add(mutation));
  return id;
}

/** Get all pending mutations in insertion order. */
export function getAllPending(): Promise<PendingMutation[]> {
  return openDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const req   = store.getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror   = () => reject(req.error);
      }),
  );
}

/** Remove a mutation after it has been successfully flushed. */
export function dequeue(id: string): Promise<void> {
  return storeOp("readwrite", s => s.delete(id)) as Promise<void>;
}

/** Increment the retry counter (called when a flush attempt fails). */
export async function incrementRetry(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const m: PendingMutation = getReq.result;
      if (!m) { resolve(); return; }
      m.retries += 1;
      const putReq = store.put(m);
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/** Count pending mutations. */
export function pendingCount(): Promise<number> {
  return storeOp("readonly", s => s.count()) as Promise<number>;
}

/** Wipe the entire queue (e.g. on sign-out). */
export function clearAll(): Promise<void> {
  return storeOp("readwrite", s => s.clear()) as Promise<void>;
}
