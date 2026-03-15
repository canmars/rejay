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
