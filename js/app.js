// Uygulamanın ana dosyası: ekranlar (view'lar), kullanıcı etkileşimleri ve günlük kontrol.

import { getState, save, replaceState, isValidBackup, requestPersistence } from './store.js';
import { searchShows, fetchShow, lookupShowId } from './api.js';
import * as T from './tmdb.js';
import * as L from './logic.js';
import { esc, toast, sheet, icon } from './ui.js';

const view = document.getElementById('view');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');

const STATUS = { watching: 'İzliyorum', plan: 'İzleyeceğim', done: 'Bitirdim', dropped: 'Bıraktım' };
const SHOW_STATUS = { Running: 'Devam ediyor', Ended: 'Bitti', 'To Be Determined': 'Belirsiz', 'In Development': 'Geliştiriliyor' };

// Sadece bellekte tutulan ekran durumu (kaydedilmez).
const ui = {
  search: { q: '', results: [], loading: false, error: '' },
  libFilter: 'all',
  openSeasons: {}, // { [showId]: Set(seasonNo) }
  revealed: new Set(), // spoiler'ı açılan bölüm id'leri
  adding: new Set(),
  checking: false,
  recs: { loading: false, error: '' },
};

const fmtDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDay = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

function commit() {
  if (!save()) toast('Kaydedilemedi — telefonda yer kalmamış olabilir.');
}

// ---------------------------------------------------------------- Yönlendirme

function route() {
  const [name, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  return { name, arg };
}

let lastRouteKey = '';
function render() {
  const r = route();
  const key = `${r.name}/${r.arg || ''}`;
  const changed = key !== lastRouteKey;
  lastRouteKey = key;

  const tab = r.name === 'show' ? 'library' : r.name;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  backBtn.hidden = r.name !== 'show';

  const views = { home: viewHome, search: viewSearch, library: viewLibrary, calendar: viewCalendar, profile: viewProfile, show: viewShow };
  (views[r.name] || viewHome)(r.arg);
  if (changed) window.scrollTo(0, 0);
}

/** Kullanıcı bir şey yazıyorsa ekranı yeniden çizip klavyeyi kapatma. */
function softRender() {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
  render();
}

function setTitle(t) {
  titleEl.textContent = t;
  document.title = t === 'Sıradaki' ? 'Dizilerim' : `${t} · Dizilerim`;
}

// ---------------------------------------------------------------- Ortak parçalar

function poster(show, cls = 'poster') {
  if (show.image) return `<img class="${cls}" src="${esc(show.image)}" alt="" loading="lazy">`;
  const initials = show.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return `<div class="${cls} poster-empty">${esc(initials)}</div>`;
}

const bar = (pct) => `<div class="bar"><span style="width:${pct}%"></span></div>`;

function section(title, body, extra = '') {
  return `<section><div class="section-head"><h2>${esc(title)}</h2>${extra}</div>${body}</section>`;
}

function empty(title, text, action = '') {
  return `<div class="empty">${icon.tv}<h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</div>`;
}

function epCard(show, ep, { ask = false, badge = '' } = {}) {
  const s = getState();
  const p = L.progress(show.episodes, s.watched);
  return `
    <div class="ep-card">
      <a class="ep-card-main" href="#/show/${show.id}">
        ${poster(show, 'thumb')}
        <div class="ep-card-text">
          <div class="ep-show">${esc(show.name)} ${badge}</div>
          <div class="ep-title">${L.code(ep)} · ${esc(ep.name)}</div>
          ${bar(p.pct)}
          <div class="meta">${p.watched}/${p.total} bölüm</div>
        </div>
      </a>
      <button class="check-btn" data-action="mark-ep" data-show="${show.id}" data-ep="${ep.id}" data-ask="${ask ? 1 : 0}" aria-label="İzledim">${icon.check}</button>
    </div>`;
}

function checkInfo() {
  const s = getState();
  let text;
  if (ui.checking) text = 'Yeni bölümler kontrol ediliyor…';
  else if (s.lastCheck) text = `Son kontrol: ${relTime(s.lastCheck)}`;
  else text = 'Henüz kontrol edilmedi';
  return `<div class="check-info"><span>${text}</span>${
    ui.checking ? '' : `<button class="link" data-action="check-now">${icon.refresh} Şimdi kontrol et</button>`
  }</div>`;
}

function relTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `bugün ${fmtTime.format(d)}` : `${fmtDate.format(d)} ${fmtTime.format(d)}`;
}

function dayLabel(t) {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + L.DAY);
  if (d.toDateString() === today.toDateString()) return 'Bugün';
  if (d.toDateString() === tomorrow.toDateString()) return 'Yarın';
  return fmtDay.format(d);
}

// ---------------------------------------------------------------- Ekran: Sıradaki (ana sayfa)

function viewHome() {
  setTitle('Sıradaki');
  const s = getState();
  const now = Date.now();
  const shows = Object.values(s.shows);

  if (!shows.length) {
    view.innerHTML = empty(
      'Henüz dizi eklemedin',
      'İzlediğin dizileri arayıp ekle; sıradaki bölümlerin burada görünsün.',
      '<a class="btn primary" href="#/search">Dizi ara</a>'
    );
    return;
  }

  const fresh = s.newEpisodes
    .map((n) => {
      const show = s.shows[n.showId];
      return { show, ep: show?.episodes.find((e) => e.id === n.epId) };
    })
    .filter((x) => x.show && x.ep && !s.watched[x.ep.id]);

  const watching = shows.filter((x) => x.status === 'watching');
  const next = watching
    .map((show) => ({ show, ep: L.nextEpisode(show, s.watched, now) }))
    .filter((x) => x.ep)
    .sort((a, b) => L.lastActivity(b.show, s.watched) - L.lastActivity(a.show, s.watched));
  const caught = watching.filter((sh) => !L.nextEpisode(sh, s.watched, now));

  let html = '';
  if (fresh.length) {
    html += section(
      'Yeni bölümler',
      fresh.map((x) => epCard(x.show, x.ep, { ask: true, badge: '<span class="badge">YENİ</span>' })).join(''),
      '<button class="link" data-action="dismiss-new">Temizle</button>'
    );
  }

  html += section(
    'İzlemeye devam',
    next.length
      ? next.map((x) => epCard(x.show, x.ep)).join('')
      : '<p class="muted pad">Şu an izlemediğin yayınlanmış bölüm yok. 🎉</p>'
  );

  if (caught.length) {
    html += section(
      'Güncelsin',
      caught
        .map((sh) => {
          const up = L.nextUpcoming(sh, now);
          const sub = up ? `Sıradaki: ${L.code(up)} · ${dayLabel(L.airTime(up))}` : 'Yeni bölüm tarihi belli değil';
          return `<a class="row" href="#/show/${sh.id}">${poster(sh, 'thumb sm')}<div><div class="ep-show">${esc(sh.name)}</div><div class="meta">${esc(sub)}</div></div></a>`;
        })
        .join('')
    );
  }

  const plan = shows.filter((x) => x.status === 'plan');
  if (plan.length) {
    html += section(
      'İzleyeceklerin',
      `<div class="hscroll">${plan.map((sh) => `<a class="mini" href="#/show/${sh.id}">${poster(sh)}<span>${esc(sh.name)}</span></a>`).join('')}</div>`
    );
  }

  html += checkInfo();
  view.innerHTML = html;
}

// ---------------------------------------------------------------- Ekran: Ara

function viewSearch() {
  setTitle('Ara');
  view.innerHTML = `
    <div class="search-box">
      <input id="q" type="search" placeholder="Dizi adı yaz…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" value="${esc(ui.search.q)}">
    </div>
    <div id="results"></div>`;
  const input = view.querySelector('#q');
  input.addEventListener('input', () => {
    ui.search.q = input.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 350);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
      clearTimeout(searchTimer);
      runSearch();
    }
  });
  renderResults();
  if (!ui.search.q) input.focus();
}

let searchTimer;
let searchSeq = 0;
async function runSearch() {
  const q = ui.search.q.trim();
  const seq = ++searchSeq;
  if (q.length < 2) {
    Object.assign(ui.search, { results: [], error: '', loading: false });
    renderResults();
    return;
  }
  ui.search.loading = true;
  renderResults();
  try {
    const results = await searchShows(q);
    if (seq !== searchSeq) return; // daha yeni bir arama başladı
    Object.assign(ui.search, { results, error: '' });
  } catch {
    if (seq !== searchSeq) return;
    ui.search.error = navigator.onLine === false ? 'İnternet bağlantısı yok.' : 'Arama yapılamadı, tekrar dene.';
  }
  ui.search.loading = false;
  renderResults();
}

function renderResults() {
  const el = document.getElementById('results');
  if (!el) return;
  const { q, results, loading, error } = ui.search;
  const s = getState();
  if (loading && !results.length) return void (el.innerHTML = '<p class="muted pad">Aranıyor…</p>');
  if (!q.trim()) return void (el.innerHTML = recsHtml());
  if (error) return void (el.innerHTML = `<p class="muted pad">${esc(error)}</p>`);
  if (!results.length && q.trim().length >= 2) return void (el.innerHTML = '<p class="muted pad">Sonuç bulunamadı.</p>');

  el.innerHTML = results
    .map((r) => {
      const added = !!s.shows[r.id];
      const year = r.premiered ? r.premiered.slice(0, 4) : '';
      const meta = [year, r.network, SHOW_STATUS[r.showStatus] || r.showStatus].filter(Boolean).join(' · ');
      let action;
      if (added) action = `<a class="pill done" href="#/show/${r.id}">${icon.check} Ekli</a>`;
      else if (ui.adding.has(r.id)) action = '<span class="pill">Ekleniyor…</span>';
      else action = `<button class="pill primary" data-action="add-show" data-id="${r.id}">Ekle</button>`;
      return `<div class="result">${poster(r, 'thumb')}<div class="result-text"><div class="ep-show">${esc(r.name)}</div><div class="meta">${esc(meta)}</div></div>${action}</div>`;
    })
    .join('');
}

function chooseList(title) {
  return sheet({
    title: title || 'Dizi ekle',
    message: 'Bu diziyi hangi listeye ekleyelim?',
    buttons: [
      { label: 'İzliyorum', value: 'watching', style: 'primary' },
      { label: 'İzleyeceğim', value: 'plan' },
      { label: 'Hepsini izledim', value: 'done' },
      { label: 'Vazgeç', value: null, style: 'ghost' },
    ],
  });
}

/** Diziyi TVmaze'den çekip listeye ekler. Hata olursa fırlatır. */
async function addShowById(id, choice) {
  const show = await fetchShow(id);
  const s = getState();
  const now = Date.now();
  s.shows[id] = { ...show, status: choice, rating: 0, note: '', addedAt: now, fetchedAt: now };
  if (choice === 'done') {
    // Tarihi bilinmeyen eski izlemeler: 1 ile işaretlenir (istatistikte "bu ay"a sayılmasın diye)
    for (const e of show.episodes) if (L.isAired(e, now) && !s.watched[e.id]) s.watched[e.id] = 1;
  }
  commit();
  toast(`${show.name} eklendi`, { label: 'Aç', run: () => (location.hash = `#/show/${id}`) });
}

async function addShowFlow(id) {
  const r = ui.search.results.find((x) => x.id === id);
  const choice = await chooseList(r?.name);
  if (!choice) return;

  ui.adding.add(id);
  renderResults();
  try {
    await addShowById(id, choice);
  } catch {
    toast('Dizi eklenemedi, internet bağlantını kontrol et.');
  }
  ui.adding.delete(id);
  renderResults();
}

// ---------------------------------------------------------------- Öneriler (Ara sekmesi, arama kutusu boşken)

function libraryExclusions(s) {
  const ids = new Set();
  const names = new Set();
  for (const show of Object.values(s.shows)) {
    const tid = s.tmdb.ids[show.id];
    if (tid) ids.add(tid);
    names.add(L.normName(show.name));
  }
  for (const h of s.tmdb.hidden) ids.add(h);
  return { ids, names };
}

function recsHtml() {
  const s = getState();
  const shows = Object.values(s.shows);
  const head = (extra = '') =>
    `<div class="section-head recs-head"><h2>Sana önerilenler</h2>${extra}</div>`;

  if (!shows.length) {
    return '<p class="muted pad">Takip etmek istediğin diziyi ara. Birkaç dizi ekleyip puan verdikçe burada sana özel öneriler çıkacak.</p>';
  }
  if (!s.settings.tmdbKey) {
    return `${head()}
      <div class="card">
        <p class="muted" style="margin:0 0 12px">Sevdiğin dizilere benzeyenleri önerebilmem için ücretsiz bir TMDB anahtarı gerekiyor.</p>
        <a class="btn primary" href="#/profile">Anahtar ekle</a>
      </div>`;
  }

  const seeds = L.pickSeeds(s);
  if (!seeds.length) {
    return `${head()}<p class="muted pad">Dizilerine puan ver ya da bölüm işaretle; öneriler ona göre hazırlanacak.</p>`;
  }

  // Gerekirse arka planda yenile (günde bir ya da dizilerin/puanların değiştiyse)
  queueMicrotask(() => loadRecs());

  const refresh = ui.recs.loading
    ? '<span class="meta">Hazırlanıyor…</span>'
    : `<button class="link" data-action="recs-refresh">${icon.refresh} Yenile</button>`;

  if (ui.recs.error) return `${head(refresh)}<p class="muted pad">${esc(ui.recs.error)}</p>`;

  const ex = libraryExclusions(s);
  const items = (s.tmdb.recs?.items || [])
    .filter((it) => !ex.ids.has(it.id) && !ex.names.has(L.normName(it.name)) && !ex.names.has(L.normName(it.original)))
    .slice(0, 20);

  if (!items.length) {
    return `${head(refresh)}<p class="muted pad">${ui.recs.loading ? 'Öneriler hazırlanıyor…' : 'Şimdilik öneri bulunamadı.'}</p>`;
  }

  return `${head(refresh)}
    ${items.map(recCard).join('')}
    <p class="about">Öneriler <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a> verileriyle hazırlanır.</p>`;
}

function recCard(it) {
  const img = T.posterUrl(it.poster);
  const posterHtml = img
    ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">`
    : poster({ name: it.name, image: null }, 'thumb');
  const meta = [it.year, it.vote ? `★ ${it.vote.toFixed(1)}` : ''].filter(Boolean).join(' · ');
  const adding = ui.adding.has(`t${it.id}`);
  return `
    <div class="rec">
      ${posterHtml}
      <div class="rec-text">
        <div class="ep-show">${esc(it.name)}</div>
        ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
        <div class="because">Benzer: ${esc(it.because.slice(0, 2).join(', '))}</div>
        ${it.overview ? `<p class="rec-sum">${esc(it.overview)}</p>` : ''}
        <div class="rec-actions">
          ${adding ? '<span class="pill">Ekleniyor…</span>' : `<button class="pill primary" data-action="add-rec" data-tmdb="${it.id}">Ekle</button>`}
          <button class="pill" data-action="hide-rec" data-tmdb="${it.id}">İlgilenmiyorum</button>
        </div>
      </div>
    </div>`;
}

async function loadRecs(force = false) {
  const s = getState();
  const key = s.settings.tmdbKey;
  if (!key || ui.recs.loading || !navigator.onLine) return;
  const seeds = L.pickSeeds(s);
  if (!seeds.length) return;
  const seedKey = seeds.map((x) => `${x.show.id}:${x.show.rating || 0}`).join(',');
  const cached = s.tmdb.recs;
  if (!force && !ui.recs.error && cached && cached.seedKey === seedKey && Date.now() - cached.ts < L.DAY) return;
  if (!force && ui.recs.error) return; // hata sonrası kendiliğinden tekrar deneme; "Yenile" ile denenir

  ui.recs.loading = true;
  ui.recs.error = '';
  renderResults();
  try {
    const lists = [];
    for (const { show, weight } of seeds) {
      let tid = s.tmdb.ids[show.id];
      if (tid === undefined) {
        tid = await T.findTmdbId(key, { imdb: show.imdb, tvdb: show.tvdb, name: show.name, year: show.premiered?.slice(0, 4) });
        s.tmdb.ids[show.id] = tid || 0;
      }
      if (!tid) continue;
      lists.push({ seed: { name: show.name, weight }, items: await T.recommendations(key, tid) });
    }
    s.tmdb.recs = { ts: Date.now(), seedKey, items: L.mergeRecommendations(lists, libraryExclusions(s)).slice(0, 40) };
    commit();
  } catch (e) {
    ui.recs.error =
      e.status === 401
        ? "TMDB anahtarı geçersiz görünüyor. Profil → Ayarlar'dan kontrol et."
        : 'Öneriler alınamadı. İnternet bağlantını kontrol edip Yenile\'ye bas.';
  }
  ui.recs.loading = false;
  renderResults();
}

async function addRecFlow(tmdbId) {
  const s = getState();
  const rec = s.tmdb.recs?.items.find((x) => x.id === tmdbId);
  if (!rec) return;
  const choice = await chooseList(rec.name);
  if (!choice) return;

  ui.adding.add(`t${tmdbId}`);
  renderResults();
  try {
    const ext = await T.externalIds(s.settings.tmdbKey, tmdbId);
    const id = await lookupShowId(ext, [rec.original, rec.name]);
    if (!id) toast("Bu dizi TVmaze'de bulunamadı. Ara'dan adıyla deneyebilirsin.");
    else if (s.shows[id]) toast('Bu dizi zaten listende.');
    else {
      s.tmdb.ids[id] = tmdbId;
      await addShowById(id, choice);
    }
  } catch {
    toast('Dizi eklenemedi, internet bağlantını kontrol et.');
  }
  ui.adding.delete(`t${tmdbId}`);
  renderResults();
}

function hideRec(tmdbId) {
  const s = getState();
  s.tmdb.hidden.push(tmdbId);
  commit();
  renderResults();
  toast('Bu öneri gizlendi', {
    label: 'Geri al',
    run: () => {
      s.tmdb.hidden = s.tmdb.hidden.filter((x) => x !== tmdbId);
      commit();
      renderResults();
    },
  });
}

async function saveTmdbKey() {
  const input = document.getElementById('tmdb-key');
  const key = input.value.trim();
  const s = getState();
  if (!key) {
    s.settings.tmdbKey = '';
    s.tmdb.recs = null;
    commit();
    toast('TMDB anahtarı kaldırıldı');
    return render();
  }
  try {
    await T.checkKey(key);
  } catch (e) {
    toast(e.status === 401 ? 'Anahtar geçersiz, kontrol edip tekrar dene.' : 'Anahtar kontrol edilemedi, internet bağlantını kontrol et.');
    return;
  }
  s.settings.tmdbKey = key;
  s.tmdb.recs = null;
  ui.recs.error = '';
  commit();
  input.blur();
  toast('Anahtar kaydedildi. Öneriler Ara sekmesinde!', { label: 'Göster', run: () => (location.hash = '#/search') });
  render();
}

// ---------------------------------------------------------------- Ekran: Dizilerim

function viewLibrary() {
  setTitle('Dizilerim');
  const s = getState();
  const shows = Object.values(s.shows);
  if (!shows.length) {
    view.innerHTML = empty('Liste boş', 'Eklediğin diziler burada görünecek.', '<a class="btn primary" href="#/search">Dizi ara</a>');
    return;
  }
  const counts = { all: shows.length };
  for (const k of Object.keys(STATUS)) counts[k] = shows.filter((x) => x.status === k).length;
  const filters = [['all', 'Tümü'], ...Object.entries(STATUS)];

  const list = shows
    .filter((x) => ui.libFilter === 'all' || x.status === ui.libFilter)
    .sort((a, b) => L.lastActivity(b, s.watched) - L.lastActivity(a, s.watched));

  view.innerHTML = `
    <div class="chips">
      ${filters.map(([k, label]) => `<button class="chip ${ui.libFilter === k ? 'active' : ''}" data-action="lib-filter" data-v="${k}">${label} <span>${counts[k]}</span></button>`).join('')}
    </div>
    ${
      list.length
        ? `<div class="grid">${list
            .map((sh) => {
              const p = L.progress(sh.episodes, s.watched);
              return `<a class="tile" href="#/show/${sh.id}">${poster(sh)}${bar(p.pct)}<div class="tile-name">${esc(sh.name)}</div><div class="meta">${p.watched}/${p.total}${sh.rating ? ` · ★${sh.rating}` : ''}</div></a>`;
            })
            .join('')}</div>`
        : '<p class="muted pad">Bu listede dizi yok.</p>'
    }`;
}

// ---------------------------------------------------------------- Ekran: Dizi detayı

function viewShow(idStr) {
  const id = Number(idStr);
  const s = getState();
  const show = s.shows[id];
  if (!show) {
    location.replace('#/library');
    return;
  }
  setTitle(show.name);
  const now = Date.now();
  const p = L.progress(show.episodes, s.watched, now);
  const seasons = L.groupSeasons(show);
  const next = L.nextEpisode(show, s.watched, now);
  if (!ui.openSeasons[id]) ui.openSeasons[id] = new Set(next ? [next.season] : []);
  const open = ui.openSeasons[id];

  const years = show.premiered ? show.premiered.slice(0, 4) + (show.ended ? '–' + show.ended.slice(0, 4) : '') : '';
  const meta = [years, show.network, SHOW_STATUS[show.showStatus] || show.showStatus].filter(Boolean).join(' · ');
  const allDone = p.total > 0 && p.watched === p.total;

  view.innerHTML = `
    <div class="hero">
      ${poster(show, 'hero-poster')}
      <div class="hero-text">
        <h2>${esc(show.name)}</h2>
        <div class="meta">${esc(meta)}</div>
        ${show.genres.length ? `<div class="meta">${esc(show.genres.join(', '))}</div>` : ''}
        <a class="imdb" href="${esc(imdbUrl(show))}" target="_blank" rel="noopener">IMDb ↗</a>
        <div class="stars" role="group" aria-label="Puanım">
          ${[1, 2, 3, 4, 5].map((n) => `<button class="star ${show.rating >= n ? 'on' : ''}" data-action="rate" data-show="${id}" data-v="${n}" aria-label="${n} yıldız">${icon.star}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="segmented">
      ${Object.entries(STATUS).map(([k, label]) => `<button class="${show.status === k ? 'active' : ''}" data-action="set-status" data-show="${id}" data-v="${k}">${label}</button>`).join('')}
    </div>

    <div class="card">
      <div class="progress-head"><strong>${p.watched}/${p.total} bölüm</strong><span>%${p.pct}</span></div>
      ${bar(p.pct)}
      <div class="btn-row">
        ${allDone
          ? `<button class="btn" data-action="unmark-all" data-show="${id}">Tümünü geri al</button>`
          : `<button class="btn primary" data-action="mark-all" data-show="${id}">Tümünü izledim</button>`}
        ${next ? `<button class="btn" data-action="mark-ep" data-show="${id}" data-ep="${next.id}" data-ask="0">${L.code(next)} izledim</button>` : ''}
      </div>
    </div>

    <label class="card note">
      <span class="label">Notum</span>
      <textarea id="note" rows="2" placeholder="Bu dizi hakkında not…">${esc(show.note)}</textarea>
    </label>

    ${show.summary ? `<details class="card summary"><summary>Dizi hakkında</summary><p>${esc(show.summary)}</p></details>` : ''}

    <div class="seasons">
      ${seasons.map(({ season, episodes }) => seasonBlock(show, season, episodes, open.has(season), now)).join('')}
    </div>

    <div class="footer-actions">
      <button class="link" data-action="refresh-show" data-show="${id}">${icon.refresh} Bilgileri güncelle</button>
      <a class="link" href="${esc(show.url)}" target="_blank" rel="noopener">TVmaze'de aç</a>
      <button class="link danger" data-action="remove-show" data-show="${id}">Diziyi kaldır</button>
    </div>`;

  const note = view.querySelector('#note');
  let noteTimer;
  note.addEventListener('input', () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      show.note = note.value;
      commit();
    }, 400);
  });

  view.querySelectorAll('details[data-season]').forEach((d) => {
    d.addEventListener('toggle', () => {
      const n = Number(d.dataset.season);
      if (d.open === open.has(n)) return; // değişiklik yok (ilk çizimde de tetiklenir)
      d.open ? open.add(n) : open.delete(n);
      render();
    });
  });
}

/** IMDb numarası biliniyorsa doğrudan dizi sayfası, yoksa IMDb araması. */
function imdbUrl(show) {
  return show.imdb
    ? `https://www.imdb.com/title/${show.imdb}/`
    : `https://www.imdb.com/find/?q=${encodeURIComponent(show.name)}&s=tt&ttype=tv`;
}

function seasonBlock(show, season, episodes, isOpen, now) {
  const s = getState();
  const p = L.progress(episodes, s.watched, now);
  const complete = p.total > 0 && p.watched === p.total;
  const action =
    p.total === 0
      ? ''
      : complete
        ? `<button class="pill" data-action="unmark-season" data-show="${show.id}" data-season="${season}">Geri al</button>`
        : `<button class="pill primary" data-action="mark-season" data-show="${show.id}" data-season="${season}">Sezonu izledim</button>`;

  return `
    <details class="season" data-season="${season}" ${isOpen ? 'open' : ''}>
      <summary>
        <div class="season-title">
          <strong>Sezon ${season}</strong>
          <span class="meta">${p.watched}/${p.total}${episodes.length > p.total ? ` · ${episodes.length - p.total} yakında` : ''}</span>
          ${bar(p.pct)}
        </div>
        ${action}
      </summary>
      ${isOpen ? `<div class="episodes">${episodes.map((ep) => episodeRow(show, ep, now)).join('')}</div>` : ''}
    </details>`;
}

function episodeRow(show, ep, now) {
  const s = getState();
  const watched = !!s.watched[ep.id];
  const aired = L.isAired(ep, now);
  const t = L.airTime(ep);
  const date = t ? fmtDate.format(new Date(t)) : 'Tarih belli değil';
  const meta = [date, ep.runtime ? `${ep.runtime} dk` : ''].filter(Boolean).join(' · ');

  let summary = '';
  if (ep.summary) {
    const visible = watched || !s.settings.spoiler || ui.revealed.has(ep.id);
    summary = visible
      ? `<p class="ep-sum">${esc(ep.summary)}</p>`
      : `<button class="reveal" data-action="reveal" data-ep="${ep.id}">Açıklamayı göster (spoiler)</button>`;
  }

  return `
    <div class="ep-row ${watched ? 'watched' : ''} ${aired ? '' : 'future'}">
      <button class="check ${watched ? 'on' : ''}" data-action="toggle-ep" data-show="${show.id}" data-ep="${ep.id}" ${aired ? '' : 'disabled'} aria-label="${watched ? 'İzlenmedi yap' : 'İzledim'}">${icon.check}</button>
      <div class="ep-body">
        <div class="ep-line"><span class="ep-num">${ep.number}.</span> ${esc(ep.name)}</div>
        <div class="meta">${esc(meta)}${aired ? '' : ' · <span class="soon">yakında</span>'}</div>
        ${summary}
      </div>
    </div>`;
}

// ---------------------------------------------------------------- Ekran: Takvim

function viewCalendar() {
  setTitle('Takvim');
  const s = getState();
  const items = L.upcomingEpisodes(Object.values(s.shows), Date.now(), 90);
  if (!items.length) {
    view.innerHTML = empty('Yaklaşan bölüm yok', 'Takip ettiğin dizilerin önümüzdeki 90 gündeki bölümleri burada görünür.');
    return;
  }
  const groups = new Map();
  for (const it of items) {
    const k = new Date(it.t).toDateString();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  view.innerHTML = [...groups.values()]
    .map((list) =>
      section(
        dayLabel(list[0].t),
        list
          .map(({ show, ep, t }) => {
            const time = ep.airtime && ep.airstamp ? fmtTime.format(new Date(t)) : '';
            return `<a class="row" href="#/show/${show.id}">${poster(show, 'thumb sm')}<div><div class="ep-show">${esc(show.name)}</div><div class="meta">${L.code(ep)}${ep.name ? ' · ' + esc(ep.name) : ''}${time ? ' · ' + time : ''}</div></div></a>`;
          })
          .join('')
      )
    )
    .join('');
}

// ---------------------------------------------------------------- Ekran: Profil (istatistik + ayarlar)

function viewProfile() {
  setTitle('Profil');
  const s = getState();
  const st = L.computeStats(s);
  view.innerHTML = `
    ${section(
      'İstatistikler',
      `<div class="stats">
        <div class="stat"><b>${st.count}</b><span>izlenen bölüm</span></div>
        <div class="stat"><b>${L.formatDuration(st.minutes)}</b><span>yaklaşık süre</span></div>
        <div class="stat"><b>${st.showCount}</b><span>dizi</span></div>
        <div class="stat"><b>${st.month}</b><span>bu ay izlenen</span></div>
      </div>
      <div class="status-list">${Object.entries(STATUS).map(([k, l]) => `<div><span>${l}</span><b>${st.byStatus[k] || 0}</b></div>`).join('')}</div>
      ${st.top.length ? `<h3 class="sub">En çok izlediklerin</h3>${st.top.map((x) => `<a class="row" href="#/show/${x.show.id}">${poster(x.show, 'thumb sm')}<div><div class="ep-show">${esc(x.show.name)}</div><div class="meta">${x.count} bölüm</div></div></a>`).join('')}` : ''}`
    )}

    ${section(
      'Ayarlar',
      `<label class="setting">
        <div><strong>Spoiler koruması</strong><div class="meta">İzlemediğin bölümlerin açıklamalarını gizle</div></div>
        <input type="checkbox" class="switch" data-action="toggle-spoiler" ${s.settings.spoiler ? 'checked' : ''}>
      </label>
      <div class="setting col">
        <div>
          <strong>TMDB anahtarı</strong>
          <div class="meta">Öneriler için gerekli. themoviedb.org → Ayarlar → API'den ücretsiz alınır. Sadece bu telefonda saklanır.</div>
        </div>
        <div class="key-row">
          <input id="tmdb-key" type="password" placeholder="API anahtarını yapıştır" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(s.settings.tmdbKey)}">
          <button class="pill primary" data-action="save-key">Kaydet</button>
        </div>
        ${s.settings.tmdbKey ? `<div class="meta ok">${icon.check} Anahtar kayıtlı</div>` : ''}
      </div>
      ${checkInfo()}`
    )}

    ${section(
      'Yedekleme',
      `<p class="muted">Veriler sadece bu telefonda duruyor. Ara sıra yedek alıp Dosyalar'a ya da iCloud'a kaydet.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="export">Yedekle</button>
        <button class="btn" data-action="import">Geri yükle</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>`
    )}

    <p class="about">
      Dizi verileri <a href="https://www.tvmaze.com" target="_blank" rel="noopener">TVmaze</a> tarafından sağlanır (CC BY-SA).<br>
      Öneriler <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a> API'si ile hazırlanır;
      bu uygulama TMDB tarafından onaylanmış ya da desteklenmiş değildir.
    </p>`;

  view.querySelector('#import-file').addEventListener('change', importData);
  view.querySelector('#tmdb-key').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveTmdbKey();
  });
}

async function exportData() {
  const data = JSON.stringify({ app: 'dizi-takip', exportedAt: new Date().toISOString(), ...getState() });
  const name = `dizi-takip-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Dizi takip yedeği' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importData(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('Dosya okunamadı.');
  }
  if (!isValidBackup(data)) return toast('Bu bir yedek dosyası değil.');
  const n = Object.keys(data.shows).length;
  const ok = await sheet({
    title: 'Yedeği geri yükle',
    message: `Yedekte ${n} dizi var. Şu anki verilerin bu yedekle değiştirilecek.`,
    buttons: [
      { label: 'Geri yükle', value: true, style: 'primary' },
      { label: 'Vazgeç', value: false, style: 'ghost' },
    ],
  });
  if (!ok) return;
  delete data.app;
  delete data.exportedAt;
  if (!replaceState(data)) return toast('Kaydedilemedi.');
  toast('Yedek geri yüklendi');
  render();
}

// ---------------------------------------------------------------- İşaretleme (izledim / geri al)

/** Değişikliği yapar, kaydeder ve "Geri al" butonlu bildirim gösterir. */
function withUndo(message, mutate) {
  const s = getState();
  const beforeWatched = { ...s.watched };
  const beforeStatus = Object.fromEntries(Object.values(s.shows).map((x) => [x.id, x.status]));
  mutate(s);
  commit();
  render();
  toast(message, {
    label: 'Geri al',
    run: () => {
      const st = getState();
      st.watched = beforeWatched;
      for (const [id, v] of Object.entries(beforeStatus)) if (st.shows[id]) st.shows[id].status = v;
      commit();
      render();
    },
  });
}

function setWatched(s, show, eps, value) {
  const now = Date.now();
  for (const e of eps) {
    if (value) {
      if (!s.watched[e.id] && L.isAired(e, now)) s.watched[e.id] = now;
    } else delete s.watched[e.id];
  }
  // Durumu otomatik güncelle
  const p = L.progress(show.episodes, s.watched, now);
  if (value && show.status === 'plan') show.status = 'watching';
  if (value && show.status === 'watching' && p.total && p.watched === p.total && show.showStatus === 'Ended') show.status = 'done';
  if (!value && show.status === 'done' && p.watched < p.total) show.status = 'watching';
}

async function markEpisode(showId, epId, ask) {
  const s = getState();
  const show = s.shows[showId];
  const ep = show?.episodes.find((e) => e.id === epId);
  if (!ep) return;

  if (s.watched[ep.id]) {
    withUndo(`${L.code(ep)} izlenmedi olarak işaretlendi`, (st) => setWatched(st, show, [ep], false));
    return;
  }

  let eps = [ep];
  if (ask) {
    const earlier = L.earlierUnwatched(show, ep.id, s.watched);
    if (earlier.length) {
      const c = await sheet({
        title: `${L.code(ep)} izlendi`,
        message: `Bundan önce izlenmemiş ${earlier.length} bölüm var. Onları da izledim olarak işaretleyeyim mi?`,
        buttons: [
          { label: 'Evet, buraya kadar hepsini', value: 'all', style: 'primary' },
          { label: 'Sadece bu bölümü', value: 'one' },
          { label: 'Vazgeç', value: null, style: 'ghost' },
        ],
      });
      if (!c) return;
      if (c === 'all') eps = [...earlier, ep];
    }
  }
  withUndo(eps.length > 1 ? `${eps.length} bölüm izlendi` : `${L.code(ep)} izlendi`, (st) => setWatched(st, show, eps, true));
}

function markSeason(showId, season, value) {
  const s = getState();
  const show = s.shows[showId];
  const eps = show.episodes.filter((e) => e.season === season);
  withUndo(value ? `Sezon ${season} izlendi` : `Sezon ${season} geri alındı`, (st) => setWatched(st, show, eps, value));
}

async function markAll(showId, value) {
  const s = getState();
  const show = s.shows[showId];
  if (!value) {
    const ok = await sheet({
      title: 'Tümünü geri al',
      message: `${show.name} için bütün izleme işaretleri kaldırılacak.`,
      buttons: [
        { label: 'Geri al', value: true, style: 'danger' },
        { label: 'Vazgeç', value: false, style: 'ghost' },
      ],
    });
    if (!ok) return;
  }
  withUndo(value ? `${show.name}: tümü izlendi` : `${show.name}: işaretler kaldırıldı`, (st) => setWatched(st, show, show.episodes, value));
}

async function removeShow(showId) {
  const s = getState();
  const show = s.shows[showId];
  const ok = await sheet({
    title: 'Diziyi kaldır',
    message: `${show.name} ve izleme geçmişi silinecek.`,
    buttons: [
      { label: 'Kaldır', value: true, style: 'danger' },
      { label: 'Vazgeç', value: false, style: 'ghost' },
    ],
  });
  if (!ok) return;
  for (const e of show.episodes) delete s.watched[e.id];
  s.newEpisodes = s.newEpisodes.filter((n) => n.showId !== show.id);
  delete s.shows[showId];
  commit();
  toast(`${show.name} kaldırıldı`);
  location.hash = '#/library';
}

// ---------------------------------------------------------------- Güncelleme ve günlük yeni bölüm kontrolü

function mergeShow(fresh) {
  const s = getState();
  const old = s.shows[fresh.id];
  if (!old) return;
  s.shows[fresh.id] = { ...old, ...fresh, fetchedAt: Date.now() };
}

async function refreshShow(showId) {
  toast('Güncelleniyor…');
  try {
    mergeShow(await fetchShow(showId));
    commit();
    render();
    toast('Bilgiler güncellendi');
  } catch {
    toast('Güncellenemedi, internet bağlantını kontrol et.');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Case 4: Uygulama açıldığında, son kontrolden 24 saat geçtiyse
 * takip edilen dizileri TVmaze'den yeniden çeker ve yeni yayınlanan bölümleri listeler.
 */
async function dailyCheck(force = false) {
  const s = getState();
  const now = Date.now();
  if (ui.checking || !navigator.onLine) return;
  if (!force && now - s.lastCheck < L.DAY) return;
  const ids = Object.values(s.shows).filter((x) => x.status !== 'dropped').map((x) => x.id);
  if (!ids.length) {
    s.lastCheck = now;
    commit();
    return;
  }

  ui.checking = true;
  softRender();
  let found = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const fresh = await fetchShow(id);
      mergeShow(fresh);
      const show = s.shows[id];
      const since = Math.max(s.lastCheck || 0, show.addedAt || 0);
      for (const ep of L.findNewEpisodes(show, since, now, s.watched)) {
        if (!s.newEpisodes.some((n) => n.epId === ep.id)) {
          s.newEpisodes.push({ showId: id, epId: ep.id });
          found++;
        }
        // "Bitirdim" dediğin dizinin yeni sezonu geldiyse tekrar "İzliyorum"a al
        if (show.status === 'done') show.status = 'watching';
      }
    } catch {
      failed++;
    }
    await sleep(500); // TVmaze limiti: ~20 istek / 10 sn
  }
  if (failed < ids.length) s.lastCheck = now;
  ui.checking = false;
  commit();
  softRender();
  if (found) toast(`${found} yeni bölüm var!`);
  else if (force) toast(failed ? 'Bazı diziler kontrol edilemedi.' : 'Yeni bölüm yok.');
}

// ---------------------------------------------------------------- Tıklamalar (tek bir dinleyici)

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'toggle-spoiler') return; // change olayında ele alınıyor
  e.preventDefault(); // <summary> içindeki butonlar sezonu açıp kapatmasın
  const showId = Number(el.dataset.show);
  const s = getState();

  switch (a) {
    case 'mark-ep':
    case 'toggle-ep':
      return void markEpisode(showId, Number(el.dataset.ep), a === 'toggle-ep' || el.dataset.ask === '1');
    case 'mark-season':
      return markSeason(showId, Number(el.dataset.season), true);
    case 'unmark-season':
      return markSeason(showId, Number(el.dataset.season), false);
    case 'mark-all':
      return void markAll(showId, true);
    case 'unmark-all':
      return void markAll(showId, false);
    case 'set-status':
      s.shows[showId].status = el.dataset.v;
      commit();
      return render();
    case 'rate': {
      const v = Number(el.dataset.v);
      const show = s.shows[showId];
      show.rating = show.rating === v ? 0 : v;
      commit();
      return render();
    }
    case 'reveal':
      ui.revealed.add(Number(el.dataset.ep));
      return render();
    case 'add-show':
      return void addShowFlow(Number(el.dataset.id));
    case 'add-rec':
      return void addRecFlow(Number(el.dataset.tmdb));
    case 'hide-rec':
      return hideRec(Number(el.dataset.tmdb));
    case 'recs-refresh':
      ui.recs.error = '';
      return void loadRecs(true);
    case 'save-key':
      return void saveTmdbKey();
    case 'lib-filter':
      ui.libFilter = el.dataset.v;
      return render();
    case 'dismiss-new':
      s.newEpisodes = [];
      commit();
      return render();
    case 'check-now':
      return void dailyCheck(true);
    case 'refresh-show':
      return void refreshShow(showId);
    case 'remove-show':
      return void removeShow(showId);
    case 'export':
      return void exportData();
    case 'import':
      return document.getElementById('import-file')?.click();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.dataset?.action === 'toggle-spoiler') {
    getState().settings.spoiler = e.target.checked;
    ui.revealed.clear();
    commit();
  }
});

backBtn.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.hash = '#/library';
});

// ---------------------------------------------------------------- Başlangıç

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') dailyCheck();
});
window.addEventListener('online', () => dailyCheck());

requestPersistence();
render();
dailyCheck();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
