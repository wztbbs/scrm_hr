// db.js - IndexedDB data layer

const DB_NAME = 'LinkedInSCRM';
const DB_VERSION = 5;

const STORES = {
  candidates: 'candidates',
  settings: 'settings'
  // sequences removed: now purely backend storage
  // tasks removed: logic simplified to use candidates.nextFollowup + backend candidate_sequences
  // history removed: now recorded automatically by backend services
};

let db = null;
let _cachedSequences = [];

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        if (!database.objectStoreNames.contains(STORES.candidates)) {
          const cs = database.createObjectStore(STORES.candidates, { keyPath: 'id', autoIncrement: true });
          cs.createIndex('linkedInId', 'linkedInId', { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.tasks)) {
          const ts = database.createObjectStore(STORES.tasks, { keyPath: 'id', autoIncrement: true });
          ts.createIndex('candidateId', 'candidateId', { unique: false });
          ts.createIndex('sequenceId', 'sequenceId', { unique: false });
          ts.createIndex('scheduledAt', 'scheduledAt', { unique: false });
        }

        if (!database.objectStoreNames.contains(STORES.settings)) {
          database.createObjectStore(STORES.settings, { keyPath: 'key' });
        }
      }

      if (oldVersion < 2) {
        // Upgrade: change linkedInId index from unique to non-unique
        if (database.objectStoreNames.contains(STORES.candidates)) {
          const transaction = event.target.transaction;
          const cs = transaction.objectStore(STORES.candidates);
          if (cs.indexNames.contains('linkedInId')) {
            cs.deleteIndex('linkedInId');
          }
          cs.createIndex('linkedInId', 'linkedInId', { unique: false });
        }
      }

      if (oldVersion < 3) {
        // Clean up legacy sequences store (no longer used)
        if (database.objectStoreNames.contains('sequences')) {
          database.deleteObjectStore('sequences');
        }
      }

      if (oldVersion < 4) {
        // Clean up tasks store (no longer used)
        if (database.objectStoreNames.contains('tasks')) {
          database.deleteObjectStore('tasks');
        }
      }

      if (oldVersion < 5) {
        // Add pipelineStage index to candidates
        if (database.objectStoreNames.contains(STORES.candidates)) {
          const transaction = event.target.transaction;
          const cs = transaction.objectStore(STORES.candidates);
          if (!cs.indexNames.contains('pipelineStage')) {
            cs.createIndex('pipelineStage', 'pipelineStage', { unique: false });
          }
        }
      }
    };
  });
}

async function getStore(storeName, mode = 'readonly') {
  const database = await openDB();
  return database.transaction(storeName, mode).objectStore(storeName);
}

// Generic CRUD
async function dbAdd(storeName, data) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.add(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, data) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, id) {
  const store = await getStore(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const store = await getStore(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, id) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbGetByIndex(storeName, indexName, value) {
  const store = await getStore(storeName, 'readonly');
  const index = store.index(indexName);
  return new Promise((resolve, reject) => {
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbClear(storeName) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ========== Candidates ==========
async function saveCandidate(candidate) {
  await openDB();

  // Ensure localId exists for backend sync
  if (!candidate.localId) {
    candidate.localId = crypto.randomUUID();
  }

  // If linkedInId is present, use it as the unique constraint (overwrite existing)
  if (candidate.linkedInId) {
    const existing = await dbGetByIndex(STORES.candidates, 'linkedInId', candidate.linkedInId);
    if (existing && existing.length > 0) {
      const updated = { ...existing[0], ...candidate, updatedAt: Date.now() };
      await dbPut(STORES.candidates, updated);
      // Sync to backend asynchronously
      syncCandidateToBackend(updated);
      return updated.id;
    }
  }
  // If no linkedInId or not found, update by id if present
  if (candidate.id) {
    candidate.updatedAt = Date.now();
    const result = await dbPut(STORES.candidates, candidate);
    syncCandidateToBackend(candidate);
    return result;
  }
  // Otherwise add new
  candidate.createdAt = Date.now();
  candidate.updatedAt = Date.now();
  const newId = await dbAdd(STORES.candidates, candidate);
  candidate.id = newId;
  syncCandidateToBackend(candidate);
  return newId;
}

async function syncCandidateToBackend(candidate) {
  if (typeof window === 'undefined' || !window.API) return;
  try {
    // Re-read full candidate from DB to ensure all fields are present
    const fullCandidate = await dbGet(STORES.candidates, candidate.id);
    if (!fullCandidate) return;
    const api = window.API.candidates;
    if (fullCandidate.serverId) {
      await api.update(fullCandidate.localId, fullCandidate);
    } else {
      const created = await api.create(fullCandidate);
      if (created && created.serverId) {
        fullCandidate.serverId = created.serverId;
        await dbPut(STORES.candidates, fullCandidate);
      }
    }
  } catch (e) {
    console.warn('[DB] Sync candidate to backend failed:', e.message);
  }
}

async function getCandidateByLinkedInId(linkedInId) {
  await openDB();
  const list = await dbGetByIndex(STORES.candidates, 'linkedInId', linkedInId);
  if (!list || list.length === 0) return null;
  return list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))[0];
}

async function getCandidateById(id) {
  await openDB();
  return dbGet(STORES.candidates, id);
}

async function getAllCandidates() {
  await openDB();
  return dbGetAll(STORES.candidates);
}

async function updateCandidate(candidate) {
  await openDB();
  candidate.updatedAt = Date.now();
  if (!candidate.localId) {
    candidate.localId = crypto.randomUUID();
  }
  const result = await dbPut(STORES.candidates, candidate);
  syncCandidateToBackend(candidate);
  return result;
}

async function deleteCandidate(id) {
  await openDB();
  const candidate = await dbGet(STORES.candidates, id);
  if (!candidate) return;

  // Soft delete: update pipeline stage to 'delete' instead of removing from IndexedDB
  candidate.pipelineStage = 'delete';
  candidate.updatedAt = Date.now();
  await dbPut(STORES.candidates, candidate);

  // Sync to backend (soft delete)
  if (candidate.localId && typeof window !== 'undefined' && window.API) {
    try {
      await window.API.candidates.delete(candidate.localId, false);
    } catch (e) {
      console.warn('[DB] Sync delete candidate to backend failed:', e.message);
    }
  }
}

// ========== Sequences (pure backend) ==========
async function refreshSequences() {
  if (typeof window === 'undefined' || !window.API) {
    _cachedSequences = [];
    return;
  }
  try {
    const resp = await window.API.sequences.list();
    let items = [];
    if (resp.data && resp.data.items) {
      items = resp.data.items;
    }
    // Sort: user-created by updatedAt desc, templates at the end
    const userSeqs = items.filter(s => !s.isTemplate && !s.isDefault);
    const templateSeqs = items.filter(s => s.isTemplate || s.isDefault);
    userSeqs.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    _cachedSequences = [...userSeqs, ...templateSeqs];
  } catch (e) {
    console.warn('[DB] Failed to fetch sequences:', e.message);
  }
}

async function getAllSequences() {
  if (_cachedSequences.length === 0) {
    await refreshSequences();
  }
  return _cachedSequences;
}

async function getSequenceById(id) {
  await getAllSequences();
  return _cachedSequences.find(s => String(s.id) === String(id)) || null;
}

async function saveSequence(seq) {
  if (typeof window === 'undefined' || !window.API) {
    throw new Error('API not available');
  }
  const apiSeq = window.API.utils.sequenceToBackend(seq);
  let result;
  if (seq.id) {
    result = await window.API.sequences.update(seq.id, apiSeq);
  } else {
    result = await window.API.sequences.create(apiSeq);
  }
  await refreshSequences();
  return result;
}

async function deleteSequence(id) {
  if (typeof window === 'undefined' || !window.API) {
    throw new Error('API not available');
  }
  await window.API.sequences.delete(id);
  await refreshSequences();
}

async function getTodaysTasks() {
  await openDB();
  const all = await dbGetAll(STORES.candidates);
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  return all.filter(c => {
    if (!c.nextFollowup) return false;
    const t = new Date(c.nextFollowup).getTime();
    return t <= endOfDay;
  }).sort((a, b) => new Date(a.nextFollowup).getTime() - new Date(b.nextFollowup).getTime());
}

// ========== Settings ==========
async function setSetting(key, value) {
  await openDB();
  return dbPut(STORES.settings, { key, value });
}

async function getSetting(key, defaultValue = null) {
  await openDB();
  const result = await dbGet(STORES.settings, key);
  return result ? result.value : defaultValue;
}

// ========== UUID & User ==========
async function ensureUserId() {
  let userId = await getSetting('userId');
  if (!userId) {
    userId = crypto.randomUUID();
    await setSetting('userId', userId);
  }
  return userId;
}

async function getUserEmail() {
  return getSetting('userEmail', '');
}

async function setUserEmail(email) {
  return setSetting('userEmail', email);
}

// ========== Meta / Sync ==========
async function setMeta(key, value) {
  return setSetting(`meta:${key}`, value);
}

async function getMeta(key, defaultValue = null) {
  return getSetting(`meta:${key}`, defaultValue);
}

// ========== Demo Data ==========
async function seedDemoData() {
  // Sequences and pipeline data are now fetched from backend on startup.
  // Demo data seeding is no longer needed.
}
