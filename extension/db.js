// db.js - Settings & User utilities (IndexedDB removed, all settings via chrome.storage.local)

// ========== Settings ==========
async function setSetting(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

async function getSetting(key, defaultValue = null) {
  const result = await chrome.storage.local.get(key);
  return result[key] !== undefined ? result[key] : defaultValue;
}

// ========== UUID & User ==========
async function ensureUserId() {
  console.log('[PLUGIN_INIT] ensureUserId START');
  const start = performance.now();
  let userId = await getSetting('userId');
  if (!userId) {
    userId = crypto.randomUUID();
    await setSetting('userId', userId);
  }
  console.log(`[PLUGIN_INIT] ensureUserId END 耗时=${(performance.now() - start).toFixed(1)}ms`);
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
