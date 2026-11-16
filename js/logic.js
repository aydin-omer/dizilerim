// Saf fonksiyonlar: DOM'a ya da internete dokunmazlar.
// Bu sayede tests/logic.test.mjs ile tek başlarına test edilebilirler.

export const DAY = 24 * 60 * 60 * 1000;

/** TVmaze özetleri HTML olarak gelir; düz metne çeviririz. */
export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Bölümün yayın zamanı (ms). Tarihi belli değilse null. */
export function airTime(ep) {
  let t = null;
  if (ep.airstamp) t = Date.parse(ep.airstamp);
  else if (ep.airdate) t = Date.parse(ep.airdate + 'T00:00:00');
  return t == null || Number.isNaN(t) ? null : t;
}

export function isAired(ep, now = Date.now()) {
  const t = airTime(ep);
  return t != null && t <= now;
}

export function sortEpisodes(eps) {
  return [...eps].sort((a, b) => a.season - b.season || a.number - b.number);
}

export function groupSeasons(show) {
  const map = new Map();
  for (const ep of sortEpisodes(show.episodes)) {
    if (!map.has(ep.season)) map.set(ep.season, []);
    map.get(ep.season).push(ep);
  }
  return [...map.entries()].map(([season, episodes]) => ({ season, episodes }));
}

/** İlerleme sadece yayınlanmış bölümler üzerinden hesaplanır. */
export function progress(eps, watched, now = Date.now()) {
  const aired = eps.filter((e) => isAired(e, now));
  const done = aired.filter((e) => watched[e.id]).length;
  return {
    watched: done,
    total: aired.length,
    pct: aired.length ? Math.round((done / aired.length) * 100) : 0,
  };
}

/** Sıradaki bölüm: en son izlenen bölümden sonraki ilk izlenmemiş, yayınlanmış bölüm. */
export function nextEpisode(show, watched, now = Date.now()) {
  const eps = sortEpisodes(show.episodes);
  let lastIdx = -1;
  eps.forEach((e, i) => {
    if (watched[e.id]) lastIdx = i;
  });
  for (let i = lastIdx + 1; i < eps.length; i++) {
    if (!watched[eps[i].id]) return isAired(eps[i], now) ? eps[i] : null;
  }
  return null;
}

/** Henüz yayınlanmamış, tarihi belli ilk bölüm. */
export function nextUpcoming(show, now = Date.now()) {
  return sortEpisodes(show.episodes).find((e) => airTime(e) != null && !isAired(e, now)) || null;
}

/** "Buraya kadar izledim" için: seçilen bölümden önceki izlenmemiş, yayınlanmış bölümler. */
export function earlierUnwatched(show, epId, watched, now = Date.now()) {
  const eps = sortEpisodes(show.episodes);
  const idx = eps.findIndex((e) => e.id === epId);
  if (idx <= 0) return [];
  return eps.slice(0, idx).filter((e) => !watched[e.id] && isAired(e, now));
}

/** (since, now] aralığında yayınlanan ve izlenmemiş bölümler. */
export function findNewEpisodes(show, since, now, watched) {
  return sortEpisodes(show.episodes).filter((e) => {
    const t = airTime(e);
    return t != null && t > since && t <= now && !watched[e.id];
  });
}

/** Önümüzdeki `days` gün içinde yayınlanacak bölümler (bırakılan diziler hariç). */
export function upcomingEpisodes(shows, now = Date.now(), days = 90) {
  const limit = now + days * DAY;
  const out = [];
  for (const show of shows) {
    if (show.status === 'dropped') continue;
    for (const ep of show.episodes) {
      const t = airTime(ep);
      if (t != null && t > now && t <= limit) out.push({ show, ep, t });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Bir dizideki en son izleme zamanı (sıralama için). */
export function lastActivity(show, watched) {
  let max = show.addedAt || 0;
  for (const e of show.episodes) {
    const ts = watched[e.id];
    if (ts && ts > max) max = ts;
  }
  return max;
}

export function computeStats(state, now = Date.now()) {
  const shows = Object.values(state.shows);
  const index = new Map();
  for (const s of shows) for (const e of s.episodes) index.set(String(e.id), { e, s });

  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  let count = 0;
  let minutes = 0;
  let month = 0;
  const perShow = new Map();

  for (const [id, ts] of Object.entries(state.watched)) {
    const hit = index.get(id);
    if (!hit) continue;
    count++;
    minutes += hit.e.runtime || hit.s.runtime || 0;
    if (ts >= monthStart) month++;
    perShow.set(hit.s.id, (perShow.get(hit.s.id) || 0) + 1);
  }

  const byStatus = { watching: 0, plan: 0, done: 0, dropped: 0 };
  for (const s of shows) byStatus[s.status] = (byStatus[s.status] || 0) + 1;

  const top = [...perShow.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => ({ show: state.shows[id], count: n }));

  return { count, minutes, month, showCount: shows.length, byStatus, top };
}

export function formatDuration(minutes) {
  if (!minutes) return '0 dk';
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days) return `${days} gün ${hours} sa`;
  if (hours) return `${hours} sa ${mins} dk`;
  return `${mins} dk`;
}

const pad = (n) => String(n).padStart(2, '0');
export function code(ep) {
  return `S${pad(ep.season)}E${pad(ep.number)}`;
}
