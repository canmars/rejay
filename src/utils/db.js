import { openDB } from 'idb';

const DB_NAME = 'rejay-audio-db';
const STORE_NAME = 'audio-files';

export async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

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
