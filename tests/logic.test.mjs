// Çalıştırmak için: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const day = (d) => new Date(NOW + d * L.DAY).toISOString();

// 2 sezon: S1 (3 bölüm, hepsi yayında), S2 (2 yayında, 1 gelecekte)
const show = {
  id: 1,
  addedAt: NOW - 30 * L.DAY,
  runtime: 50,
  episodes: [
    { id: 11, season: 1, number: 1, airstamp: day(-100), runtime: 45 },
    { id: 13, season: 1, number: 3, airstamp: day(-86) },
    { id: 12, season: 1, number: 2, airstamp: day(-93) },
    { id: 21, season: 2, number: 1, airstamp: day(-10) },
    { id: 22, season: 2, number: 2, airstamp: day(-0.5) },
    { id: 23, season: 2, number: 3, airstamp: day(6) },
  ],
};

test('stripHtml', () => {
  assert.equal(L.stripHtml('<p>Merhaba &amp; <b>dünya</b></p>'), 'Merhaba & dünya');
  assert.equal(L.stripHtml(null), '');
});

test('isAired: tarihi olmayan bölüm yayınlanmamış sayılır', () => {
  assert.equal(L.isAired({ airstamp: '', airdate: '' }, NOW), false);
  assert.equal(L.isAired({ airdate: '2020-01-01' }, NOW), true);
});

test('progress sadece yayınlanmış bölümleri sayar', () => {
  assert.deepEqual(L.progress(show.episodes, { 11: 1, 12: 1 }, NOW), { watched: 2, total: 5, pct: 40 });
});

test('nextEpisode: son izlenenden sonraki bölüm', () => {
  assert.equal(L.nextEpisode(show, {}, NOW).id, 11);
  assert.equal(L.nextEpisode(show, { 11: 1, 12: 1 }, NOW).id, 13);
  // aradaki boşluk atlanır, son izlenenden devam edilir
  assert.equal(L.nextEpisode(show, { 21: 1 }, NOW).id, 22);
  // sıradaki henüz yayınlanmadıysa null
  assert.equal(L.nextEpisode(show, { 22: 1 }, NOW), null);
});

test('nextUpcoming', () => {
  assert.equal(L.nextUpcoming(show, NOW).id, 23);
});

test('earlierUnwatched: buraya kadar izledim', () => {
  assert.deepEqual(L.earlierUnwatched(show, 21, { 12: 1 }, NOW).map((e) => e.id), [11, 13]);
  assert.deepEqual(L.earlierUnwatched(show, 11, {}, NOW), []);
});

test('findNewEpisodes: son kontrolden sonra yayınlananlar', () => {
  assert.deepEqual(L.findNewEpisodes(show, NOW - L.DAY, NOW, {}).map((e) => e.id), [22]);
  assert.deepEqual(L.findNewEpisodes(show, NOW - L.DAY, NOW, { 22: 1 }), []);
});

test('upcomingEpisodes: bırakılan diziler hariç', () => {
  assert.deepEqual(L.upcomingEpisodes([show], NOW).map((x) => x.ep.id), [23]);
  assert.deepEqual(L.upcomingEpisodes([{ ...show, status: 'dropped' }], NOW), []);
});

test('computeStats', () => {
  const state = { shows: { 1: { ...show, status: 'watching' } }, watched: { 11: 1, 12: NOW - 1000 } };
  const st = L.computeStats(state, NOW);
  assert.equal(st.count, 2);
  assert.equal(st.minutes, 45 + 50); // bölüm süresi yoksa dizi süresi
  assert.equal(st.month, 1);
  assert.equal(st.byStatus.watching, 1);
});

test('formatDuration ve code', () => {
  assert.equal(L.formatDuration(95), '1 sa 35 dk');
  assert.equal(L.formatDuration(60 * 24 + 120), '1 gün 2 sa');
  assert.equal(L.code({ season: 1, number: 5 }), 'S01E05');
});

test('normName', () => {
  assert.equal(L.normName('The Office (US)'), 'the office us');
  assert.equal(L.normName('İçerde'), 'içerde');
});

test('pickSeeds: puan ve izleme sayısına göre, bırakılanlar hariç', () => {
  const mk = (id, rating, status, eps) => ({ id, name: 'D' + id, rating, status, episodes: eps.map((e) => ({ id: e })) });
  const state = {
    shows: { 1: mk(1, 5, 'watching', [11]), 2: mk(2, 0, 'watching', [21, 22]), 3: mk(3, 5, 'dropped', [31]), 4: mk(4, 0, 'plan', [41]) },
    watched: { 11: 1, 21: 1, 22: 1, 31: 1 },
  };
  const seeds = L.pickSeeds(state);
  assert.deepEqual(seeds.map((s) => s.show.id), [1, 2]);
  assert.equal(seeds[0].weight, 2);
});

test('mergeRecommendations: ortak öneriler üste çıkar, listedekiler ve az oylananlar elenir', () => {
  const it = (id, name, votes = 100) => ({ id, name, original: name, votes });
  const lists = [
    { seed: { name: 'A', weight: 2 }, items: [it(1, 'Bir'), it(2, 'İki'), it(9, 'Az Oylanan', 3)] },
    { seed: { name: 'B', weight: 1 }, items: [it(3, 'Üç'), it(2, 'İki'), it(4, 'Listemde')] },
  ];
  const out = L.mergeRecommendations(lists, { ids: new Set(), names: new Set(['listemde']) });
  assert.deepEqual(out.map((x) => x.id), [2, 1, 3]);
  assert.deepEqual(out[0].because, ['A', 'B']);
});
