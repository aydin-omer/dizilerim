// Verilerin tamamı telefonda, localStorage'da durur. Sunucu yok.

const KEY = 'dizi-takip';

const defaults = () => ({
  version: 1,
  shows: {}, // { [showId]: dizi bilgisi + bölümler + status/rating/note }
  watched: {}, // { [episodeId]: izlendiği zaman (ms) }
  lastCheck: 0, // son "yeni bölüm" kontrolü
  newEpisodes: [], // [{ showId, epId }]
  settings: { spoiler: true },
});

function normalize(s) {
  const d = defaults();
  return {
    ...d,
    ...s,
    shows: s.shows || {},
    watched: s.watched || {},
    newEpisodes: Array.isArray(s.newEpisodes) ? s.newEpisodes : [],
    settings: { ...d.settings, ...(s.settings || {}) },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : defaults();
  } catch {
    return defaults();
  }
}

let state = load();

export function getState() {
  return state;
}

/** Kaydeder; başarısız olursa (ör. depolama dolu) false döner. */
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Kaydedilemedi', e);
    return false;
  }
}

/** Yedekten geri yükleme. */
export function replaceState(next) {
  state = normalize(next);
  return save();
}

export function isValidBackup(data) {
  return (
    data &&
    typeof data === 'object' &&
    data.shows && typeof data.shows === 'object' &&
    data.watched && typeof data.watched === 'object'
  );
}

/** Tarayıcıdan verileri silmemesini rica et. */
export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch {
    /* önemli değil */
  }
}
