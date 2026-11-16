// TMDB (The Movie Database) API — sadece "Öneriler" bölümü için kullanılır.
// Ücretsiz anahtar gerekir (themoviedb.org → Ayarlar → API); anahtar sadece telefonda saklanır.
// Ticari olmayan kullanım için ücretsizdir, TMDB'ye atıf zorunludur.

const BASE = 'https://api.themoviedb.org/3';

export const posterUrl = (path, size = 'w185') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

export class TmdbError extends Error {
  constructor(status) {
    super(`TMDB HTTP ${status}`);
    this.status = status;
  }
}

async function get(key, path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v);
  const headers = {};
  // Uzun "API Read Access Token" (eyJ… ile başlar) ya da kısa "API Key" — ikisi de çalışır.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new TmdbError(res.status);
  return res.json();
}

/** Anahtar geçerli mi? Geçersizse TmdbError(401) fırlatır. */
export async function checkKey(key) {
  await get(key, '/configuration');
}

/** TVmaze'deki bir dizinin TMDB numarasını bul: önce IMDb, sonra TheTVDB, en son isimle. */
export async function findTmdbId(key, { imdb, tvdb, name, year }) {
  const tries = [
    ['imdb_id', imdb],
    ['tvdb_id', tvdb],
  ];
  for (const [source, value] of tries) {
    if (!value) continue;
    const r = await get(key, `/find/${value}`, { external_source: source });
    if (r.tv_results?.length) return r.tv_results[0].id;
  }
  if (name) {
    const r = await get(key, '/search/tv', { query: name, first_air_date_year: year });
    if (r.results?.length) return r.results[0].id;
  }
  return null;
}

/** "Bunu izleyenler bunları da sevdi" listesi (Türkçe ad ve açıklamalarla). */
export async function recommendations(key, tmdbId) {
  const r = await get(key, `/tv/${tmdbId}/recommendations`, { language: 'tr-TR', page: 1 });
  return (r.results || []).map((x) => ({
    id: x.id,
    name: x.name || x.original_name || '',
    original: x.original_name || '',
    poster: x.poster_path || null,
    overview: x.overview || '',
    vote: x.vote_average || 0,
    votes: x.vote_count || 0,
    year: (x.first_air_date || '').slice(0, 4),
  }));
}

/** Öneriyi TVmaze'de bulabilmek için IMDb / TheTVDB numaraları. */
export async function externalIds(key, tmdbId) {
  const r = await get(key, `/tv/${tmdbId}/external_ids`);
  return { imdb: r.imdb_id || null, tvdb: r.tvdb_id || null };
}
