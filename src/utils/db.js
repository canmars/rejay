import { openDB } from 'idb';

const DB_NAME = 'rejay-audio-db';
const STORE_NAME = 'audio-files';
const METADATA_STORE = 'project-metadata';

export async function initDB() {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE);
      }
    },
  });
}

// ── Audio Helpers ──
// ... existing audio helpers below ...


export async function saveAudioFile(id, blob) {
  const db = await initDB();
  return db.put(STORE_NAME, blob, id);
}

export async function getAudioFile(id) {
  const db = await initDB();
  return db.get(STORE_NAME, id);
}

export async function deleteAudioFile(id) {
  const db = await initDB();
  return db.delete(STORE_NAME, id);
}

export async function clearAllAudio() {
  const db = await initDB();
  return db.clear(STORE_NAME);
}

export async function getAllAudio() {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const keys = await store.getAllKeys();
  const audios = {};
  for (const key of keys) {
    audios[key] = await store.get(key);
  }
  return audios;
}

export async function saveBulkAudio(audios) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const [id, blob] of Object.entries(audios)) {
    await tx.objectStore(STORE_NAME).put(blob, id);
  }
  return tx.done;
}

// ── Project Metadata Helpers ──

export async function saveProjectData(key, data) {
  const db = await initDB();
  return db.put(METADATA_STORE, data, key);
}

export async function getProjectData(key) {
  const db = await initDB();
  return db.get(METADATA_STORE, key);
}

export async function clearProjectData() {
  const db = await initDB();
  return db.clear(METADATA_STORE);
}

