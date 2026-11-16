// TVmaze public API — anahtar gerektirmez. Veriler CC BY-SA lisanslıdır.
// Dokümantasyon: https://www.tvmaze.com/api

import { stripHtml } from './logic.js';

const BASE = 'https://api.tvmaze.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, tries = 3) {
  const res = await fetch(BASE + path);
  // 429 = çok fazla istek (limit: ~20 istek / 10 sn). Biraz bekleyip tekrar dene.
  if (res.status === 429 && tries > 1) {
    await sleep(2500);
    return get(path, tries - 1);
  }
  if (!res.ok) throw new Error(`TVmaze HTTP ${res.status}`);
  return res.json();
}

function basic(s) {
  return {
    id: s.id,
    name: s.name,
    image: s.image?.medium || null,
    network: s.network?.name || s.webChannel?.name || '',
    country: s.network?.country?.code || s.webChannel?.country?.code || '',
    showStatus: s.status || '',
    premiered: s.premiered || '',
    ended: s.ended || '',
    runtime: s.averageRuntime || s.runtime || null,
    genres: s.genres || [],
    summary: stripHtml(s.summary),
    url: s.url || `https://www.tvmaze.com/shows/${s.id}`,
  };
}

export async function searchShows(query) {
  const data = await get('/search/shows?q=' + encodeURIComponent(query));
  return data.map((d) => basic(d.show));
}

/** Dizi bilgisi + tüm (normal) bölümleri tek istekte. */
export async function fetchShow(id) {
  const s = await get(`/shows/${id}?embed=episodes`);
  const episodes = (s._embedded?.episodes || [])
    .filter((e) => e.number != null) // özel bölümleri atla
    .map((e) => ({
      id: e.id,
      season: e.season,
      number: e.number,
      name: e.name || '',
      airdate: e.airdate || '',
      airtime: e.airtime || '',
      airstamp: e.airstamp || '',
      runtime: e.runtime || null,
      summary: stripHtml(e.summary).slice(0, 600),
    }));
  return { ...basic(s), episodes };
}
