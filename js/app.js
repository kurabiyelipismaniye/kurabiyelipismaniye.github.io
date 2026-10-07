/* Oyun Arşivi — site mantığı.
   Sunucu yok: liste data/games.js dosyasından okunur. Düzenlemeler bu tarayıcıda
   (localStorage) saklanır; "Yayınla" penceresi listeyi data/games.js olarak dışa aktarır. */
(() => {
  'use strict';

  const STORE_KEY = 'oyunArsivi.veri.v1';
  const PREFS_KEY = 'oyunArsivi.tercih.v1';

  const CATEGORY_SUGGESTIONS = [
    'Aksiyon', 'Macera', 'RPG', 'Açık Dünya', 'Hayatta Kalma', 'Korku', 'Nişancı (FPS)',
    'Strateji', 'Simülasyon', 'Spor', 'Yarış', 'Platform', 'Bulmaca', 'Dövüş',
    'Çok Oyunculu', 'Bağımsız (Indie)', 'Sandbox', 'Rogue-like'
  ];
  const PLATFORM_SUGGESTIONS = [
    'PC', 'PlayStation 5', 'PlayStation 4', 'Xbox Series X|S', 'Xbox One', 'Nintendo Switch', 'Mobil', 'VR'
  ];
  const SITE_DEFAULTS = {
    channelName: 'Kanalım',
    title: 'Oyun Arşivi',
    tagline: '',
    youtubeUrl: '',
    githubEditUrl: ''
  };

  /* ---------- yardımcılar ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  const lower = (s) => String(s || '').toLocaleLowerCase('tr');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const DAY_MS = 86400000;

  function parseDay(iso) {
    if (!iso) return null;
    const d = new Date(ISO_DAY.test(String(iso)) ? `${iso}T12:00:00` : iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(iso, month = 'long') {
    const d = parseDay(iso);
    return d ? d.toLocaleDateString('tr-TR', { day: 'numeric', month, year: 'numeric' }) : '';
  }

  // "bugün", "3 gün önce", "2 ay önce", "yarın" gibi göreli zaman. Yalnızca dün/bugün/yarın sözcükle
  // yazılır; "geçen ay" gibi takvim sözcükleri süreyle karışmasın diye diğerleri hep sayıyla verilir.
  const hasRel = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat;
  const relAuto = hasRel ? new Intl.RelativeTimeFormat('tr', { numeric: 'auto' }) : null;
  const relNum = hasRel ? new Intl.RelativeTimeFormat('tr', { numeric: 'always' }) : null;
  function relativeDay(iso) {
    const d = parseDay(iso);
    if (!d || !hasRel) return '';
    const days = Math.round((d - parseDay(todayISO())) / DAY_MS);
    const abs = Math.abs(days);
    if (abs <= 1) return relAuto.format(days, 'day');
    const [unit, size] = abs < 7 ? ['day', 1] : abs < 30 ? ['week', 7] : abs < 335 ? ['month', 30.44] : ['year', 365];
    return relNum.format(Math.sign(days) * Math.max(1, Math.round(abs / size)), unit);
  }

  function daysBetween(a, b) {
    const da = parseDay(a);
    const db = parseDay(b);
    return da && db ? Math.round((db - da) / DAY_MS) : 0;
  }

  // Takvimde gerçekten var olan YYYY-AA-GG tarihi mi (ör. 2026-02-30 ya da 20266-01-15 değil)
  function isValidDay(iso) {
    if (!ISO_DAY.test(String(iso))) return false;
    const [y, m, d] = String(iso).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function storageGet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* depolama kapalı */ }
  }

  // Görsel adresi: http(s), yüklenen görsel (data:image) ya da depodaki göreli yol (ör. images/kapak.jpg)
  function safeImage(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^(https?:|data:image\/)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return '';
    return u;
  }
  const safeLink = (url) => (/^https?:\/\//i.test(String(url || '').trim()) ? String(url).trim() : '');

  function youtubeId(url) {
    const m = String(url || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function hashHue(str) {
    let h = 7;
    for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
  }

  /* ---------- veri ---------- */
  // Aynı kimlik ikinci kez görülürse sonuna -2, -3 eklenir; her yüklemede aynı sonucu verir.
  function uniqueId(base, seen) {
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    return id;
  }

  function normalizeEpisode(e, fallbackId) {
    e = e && typeof e === 'object' ? e : {};
    const date = String(e.date || '').trim().slice(0, 10);
    return {
      id: String(e.id || fallbackId || uid()),
      title: String(e.title || '').trim(),
      url: String(e.url || '').trim(),
      date: isValidDay(date) ? date : ''
    };
  }

  // Bölümler yayın tarihine göre sıralanır; tarihi olmayanlar sona kalır (aynı tarihliler yerini korur).
  function sortEpisodes(list) {
    const key = (e) => e.date || '9999-99-99';
    return list
      .map((e, i) => [e, i])
      .sort(([a, i], [b, j]) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : i - j))
      .map(([e]) => e);
  }

  // Kimliği olmayan oyun ve bölümlere sıralarından türetilen sabit bir kimlik verilir; böylece
  // data/games.js her yüklendiğinde aynı sonucu verir ve "yayınlanmamış değişiklik" yanlış görünmez.
  function normalizeGame(g, index = 0) {
    g = g && typeof g === 'object' ? g : {};
    const id = String(g.id || `oyun-${index + 1}`);
    const played = Boolean(g.played);
    let episodes = Array.isArray(g.episodes)
      ? g.episodes.map((e, i) => normalizeEpisode(e, `${id}-ep${i + 1}`))
      : [];
    // eski sürümdeki tek "video" alanı ilk bölüm olarak taşınır
    if (!episodes.length && g.video) episodes = [normalizeEpisode({ url: g.video }, `${id}-ep1`)];
    const seen = new Set();
    for (const e of episodes) e.id = uniqueId(e.id, seen);
    return {
      id,
      title: String(g.title || '').trim() || 'İsimsiz oyun',
      category: String(g.category || '').trim() || 'Diğer',
      platform: String(g.platform || '').trim(),
      description: String(g.description || '').trim(),
      cover: String(g.cover || '').trim(),
      rating: Math.max(0, Math.min(5, Math.round(Number(g.rating) || 0))),
      played,
      playedAt: played && g.playedAt ? String(g.playedAt) : null,
      addedAt: String(g.addedAt || ''), // bilinmiyorsa boş kalır; "şimdi" yazmak her yüklemede değişirdi
      episodes: sortEpisodes(episodes),
      ...(g.example === true ? { example: true } : {})
    };
  }

  // İleri tarihli bölüm (planlanmış video ya da prömiyer) henüz yayınlanmamış sayılır.
  const isUpcoming = (e) => Boolean(e.date) && e.date > todayISO();
  const airedEpisodes = (g) => g.episodes.filter((e) => !isUpcoming(e));

  // Oyunun durumu: bittiyse "played", yayınlanmış bölümü varsa "ongoing", yoksa "todo"
  const gameState = (g) => (g.played ? 'played' : airedEpisodes(g).length ? 'ongoing' : 'todo');

  function seriesInfo(g) {
    const aired = airedEpisodes(g);
    const dated = aired.filter((e) => e.date);
    const upcoming = g.episodes.filter(isUpcoming);
    return {
      aired,
      dated,
      upcoming,
      first: dated.length ? dated[0].date : '',
      last: dated.length ? dated[dated.length - 1].date : ''
    };
  }

  const hasVideo = (e) => Boolean(youtubeId(e.url));
  // Kapak için herhangi bir bölümün küçük resmi yeter; oynatmak için yayınlanmış bölüm gerekir.
  const coverVideo = (episodes) => (episodes || []).find(hasVideo) || null;
  // YouTube linkleri şeması eksik yazılmış olsa da (youtube.com/...) düzgün bir adrese çevrilir.
  function episodeLink(e) {
    const vid = youtubeId(e.url);
    return safeLink(e.url) || (vid ? `https://www.youtube.com/watch?v=${vid}` : '');
  }

  function normalizeData(d) {
    d = d && typeof d === 'object' ? d : {};
    const site = { ...SITE_DEFAULTS };
    if (d.site && typeof d.site === 'object') {
      for (const k of Object.keys(SITE_DEFAULTS)) if (d.site[k] != null) site[k] = String(d.site[k]);
    }
    const games = Array.isArray(d.games) ? d.games.map((g, i) => normalizeGame(g, i)) : [];
    const seen = new Set();
    for (const g of games) g.id = uniqueId(g.id, seen);
    return { version: Number(d.version) || 0, site, games };
  }

  const published = normalizeData(window.SITE_DATA);
  let data = loadData();

  // Yerel kayıt, yayındaki dosyadan eski değilse kullanılır. Başka bir cihazdan daha yeni
  // bir liste yayınlandıysa yerel kopya bırakılır ve yayındaki gösterilir.
  function loadData() {
    const local = storageGet(STORE_KEY);
    if (local && Array.isArray(local.games)) {
      const base = Number(local.baseVersion) || 0;
      if (base >= published.version) {
        // Bölümlerden önceki sürümde kaydedilmiş örnek oyunlara yeni örnek bölümleri ve işareti ekle
        for (const lg of local.games) {
          if (!lg || typeof lg !== 'object' || 'episodes' in lg || lg.video) continue;
          const pg = published.games.find((p) => p.id === lg.id && p.example);
          // kullanıcı örneği kendi oyununa çevirdiyse (ad, açıklama, puan… değiştiyse) dokunma
          const untouched = pg && ['title', 'category', 'platform', 'description', 'cover', 'rating']
            .every((k) => String(lg[k] ?? '').trim() === String(pg[k] ?? '').trim());
          if (untouched) {
            lg.episodes = clone(pg.episodes);
            lg.example = true;
          }
        }
        const d = normalizeData(local);
        d.baseVersion = base;
        return d;
      }
      storageRemove(STORE_KEY);
    }
    const d = clone(published);
    d.baseVersion = published.version;
    return d;
  }

  function persist() {
    const ok = storageSet(STORE_KEY, { baseVersion: data.baseVersion, site: data.site, games: data.games });
    if (!ok) {
      toast('Değişiklik kaydedilemedi: tarayıcı depolaması dolu ya da kapalı. Büyük yüklenen görseller yerine görsel linki kullanmayı dene.', { error: true });
    }
    return ok;
  }

  const snapshot = (d) => JSON.stringify({ site: d.site, games: d.games });
  const isDirty = () => snapshot(data) !== snapshot(published);
  const findGame = (id) => data.games.find((g) => g.id === id);

  function commit() {
    persist();
    render();
  }

  /* ---------- tercihler ---------- */
  const prefs = Object.assign(
    { editing: false, theme: '', status: 'all', category: 'all', sort: 'recent' },
    storageGet(PREFS_KEY) || {}
  );
  if (!['all', 'played', 'ongoing', 'todo'].includes(prefs.status)) prefs.status = 'all';
  const savePrefs = () => storageSet(PREFS_KEY, prefs);
  let searchText = '';
  let justToggled = null;

  /* ---------- DOM ---------- */
  const el = {
    channelName: $('#channelName'),
    siteTitle: $('#siteTitle'),
    siteTagline: $('#siteTagline'),
    subscribe: $('#subscribeLink'),
    themeBtn: $('#themeBtn'),
    editToggle: $('#editToggle'),
    editBar: $('#editBar'),
    dirtyPill: $('#dirtyPill'),
    saveCount: $('#saveCount'),
    savePct: $('#savePct'),
    xpBar: $('#xpBar'),
    xpFill: $('#xpFill'),
    xpOngoing: $('#xpOngoing'),
    statPlayed: $('#statPlayed'),
    statOngoing: $('#statOngoing'),
    statTodo: $('#statTodo'),
    statEpisodes: $('#statEpisodes'),
    clearExamples: $('#clearExamples'),
    search: $('#searchInput'),
    sort: $('#sortSelect'),
    chips: $('#categoryChips'),
    resultLine: $('#resultLine'),
    grid: $('#grid'),
    empty: $('#emptyState'),
    footerText: $('#footerText'),
    footerYt: $('#footerYt'),
    detailDialog: $('#detailDialog'),
    detailContent: $('#detailContent'),
    formDialog: $('#formDialog'),
    form: $('#gameForm'),
    settingsDialog: $('#settingsDialog'),
    settingsForm: $('#settingsForm'),
    dataDialog: $('#dataDialog'),
    toasts: $('#toasts')
  };

  /* ---------- tema ---------- */
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function isDarkNow() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return Boolean(darkQuery && darkQuery.matches);
  }
  function applyTheme() {
    if (prefs.theme) document.documentElement.setAttribute('data-theme', prefs.theme);
    const dark = isDarkNow();
    el.themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
    el.themeBtn.setAttribute('aria-label', dark ? 'Açık temaya geç' : 'Koyu temaya geç');
  }

  /* ---------- çizim ---------- */
  function coverHTML(g) {
    const ep = coverVideo(g.episodes);
    const vid = ep ? youtubeId(ep.url) : '';
    const src = safeImage(g.cover) || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '');
    const gen = `<div class="gen-cover" style="--h:${hashHue(g.title)}" aria-hidden="true"><span>${esc(g.title)}</span></div>`;
    return src ? `${gen}<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : gen;
  }

  function starsHTML(rating) {
    if (!rating) return '<span class="stars-none"></span>';
    let s = '';
    for (let i = 1; i <= 5; i++) s += icon('star', `icon${i <= rating ? ' on' : ''}`);
    return `<span class="stars" role="img" aria-label="5 üzerinden ${rating} puan">${s}</span>`;
  }

  function statusHTML(g) {
    if (prefs.editing) {
      return `<div class="card-foot-right">
        <button type="button" class="icon-btn" data-action="edit" aria-label="${esc(g.title)} oyununu düzenle">${icon('edit')}</button>
        <button type="button" class="tick" data-action="toggle" aria-pressed="${g.played}">
          <span class="tick-box">${icon('check')}</span>Oynadım
        </button>
      </div>`;
    }
    const state = gameState(g);
    if (state === 'played') return `<span class="status is-played">${icon('check')}Oynandı</span>`;
    if (state === 'ongoing') return '<span class="status is-ongoing">Devam ediyor</span>';
    return '<span class="status">Sırada</span>';
  }

  function coverBadgeHTML(g) {
    const aired = airedEpisodes(g).length;
    if (aired) return `<span class="cover-video">${icon('play')}${aired} bölüm</span>`;
    if (g.episodes.length) return '<span class="cover-video is-soon">Yakında</span>';
    return '';
  }

  function cardHTML(g) {
    const classes = ['card'];
    if (g.played) classes.push('is-played');
    if (g.id === justToggled) classes.push('just-toggled');
    return `<article class="${classes.join(' ')}" data-id="${esc(g.id)}">
      <button type="button" class="cover" data-action="open" aria-label="${esc(g.title)}: ayrıntılar">
        ${coverHTML(g)}
        ${coverBadgeHTML(g)}
        <span class="stamp" aria-hidden="true">${icon('check')}Oynandı</span>
      </button>
      <div class="card-body">
        <div class="card-meta">
          <button type="button" class="chip" data-action="category" data-category="${esc(g.category)}" aria-label="${esc(g.category)} kategorisini göster">${esc(g.category)}</button>
          ${g.platform ? `<span class="platform">${esc(g.platform)}</span>` : ''}
          ${g.example ? '<span class="example-chip" title="Örnek olarak eklendi">Örnek</span>' : ''}
        </div>
        <h3 class="card-title">${esc(g.title)}</h3>
        ${g.description ? `<p class="card-desc">${esc(g.description)}</p>` : ''}
        <div class="card-foot">
          ${starsHTML(g.rating)}
          ${statusHTML(g)}
        </div>
      </div>
    </article>`;
  }

  function categoryCounts() {
    const map = new Map();
    for (const g of data.games) map.set(g.category, (map.get(g.category) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }

  function visibleGames() {
    const q = lower(searchText.trim());
    const list = data.games.filter((g) => {
      if (prefs.status !== 'all' && gameState(g) !== prefs.status) return false;
      if (prefs.category !== 'all' && g.category !== prefs.category) return false;
      if (q) {
        const episodeText = g.episodes.map((e) => e.title).join(' ');
        if (!lower(`${g.title} ${g.category} ${g.platform} ${g.description} ${episodeText}`).includes(q)) return false;
      }
      return true;
    });
    const byTitle = (a, b) => a.title.localeCompare(b.title, 'tr');
    const sorters = {
      recent: (a, b) => String(b.addedAt).localeCompare(String(a.addedAt)) || byTitle(a, b),
      az: byTitle,
      rating: (a, b) => b.rating - a.rating || byTitle(a, b),
      episode: (a, b) => seriesInfo(b).last.localeCompare(seriesInfo(a).last) || byTitle(a, b),
      finished: (a, b) => String(b.playedAt || '').localeCompare(String(a.playedAt || '')) || byTitle(a, b)
    };
    return list.sort(sorters[prefs.sort] || sorters.recent);
  }

  function renderSite() {
    const s = data.site;
    el.channelName.textContent = s.channelName;
    el.siteTitle.textContent = s.title;
    el.siteTagline.textContent = s.tagline;
    el.siteTagline.hidden = !s.tagline;
    document.title = s.channelName ? `${s.title} · ${s.channelName}` : s.title;

    const yt = safeLink(s.youtubeUrl);
    el.subscribe.hidden = !yt;
    el.footerYt.hidden = !yt;
    if (yt) {
      el.subscribe.href = yt;
      el.footerYt.href = yt;
    }
    el.footerText.textContent = `© ${new Date().getFullYear()} ${s.channelName} · ${data.games.length} oyun`;
  }

  function stateCounts() {
    const counts = { all: data.games.length, played: 0, ongoing: 0, todo: 0 };
    for (const g of data.games) counts[gameState(g)] += 1;
    return counts;
  }

  function renderStats() {
    const c = stateCounts();
    const pct = c.all ? Math.round((c.played / c.all) * 100) : 0;
    const startedPct = c.all ? Math.round(((c.played + c.ongoing) / c.all) * 100) : 0;
    el.saveCount.textContent = `${c.played} / ${c.all}`;
    el.savePct.textContent = `%${pct}`;
    el.xpFill.style.width = `${pct}%`;
    el.xpOngoing.style.width = `${startedPct}%`;
    el.xpBar.setAttribute('aria-valuenow', String(pct));
    el.xpBar.setAttribute('aria-valuetext', `${c.all} oyunun ${c.played} tanesi oynandı, ${c.ongoing} tanesi devam ediyor`);
    el.statPlayed.textContent = c.played;
    el.statOngoing.textContent = c.ongoing;
    el.statTodo.textContent = c.todo;
    el.statEpisodes.textContent = data.games.reduce((n, g) => n + airedEpisodes(g).length, 0);
  }

  function renderFilters() {
    const c = stateCounts();
    const total = c.all;
    for (const key of Object.keys(c)) $(`[data-count="${key}"]`).textContent = c[key];
    const radio = $(`#statusFilter input[value="${prefs.status}"]`) || $('#st-all');
    radio.checked = true;
    el.sort.value = prefs.sort;

    const cats = categoryCounts();
    if (prefs.category !== 'all' && !cats.some(([c]) => c === prefs.category)) prefs.category = 'all';
    const chip = (value, label, count) =>
      `<button type="button" class="chip-filter" data-category="${esc(value)}" aria-pressed="${prefs.category === value}">${esc(label)} <b>${count}</b></button>`;
    el.chips.innerHTML = chip('all', 'Tüm kategoriler', total) + cats.map(([c, n]) => chip(c, c, n)).join('');
    el.chips.hidden = cats.length === 0;
  }

  function renderGrid() {
    const list = visibleGames();
    el.grid.innerHTML = list.map(cardHTML).join('');
    justToggled = null;

    const total = data.games.length;
    const filtered = list.length !== total;
    el.resultLine.textContent = total === 0 ? '' : filtered ? `${total} oyundan ${list.length} tanesi gösteriliyor` : `${total} oyun`;

    if (total === 0) {
      el.empty.innerHTML = prefs.editing
        ? `<h2>Arşiv boş</h2><p>İlk oyununu ekle; adını, kategorisini ve kısa bir açıklamasını yazman yeterli.</p>
           <button type="button" class="btn btn-primary" data-empty="add">${icon('plus')}<span>Oyun ekle</span></button>`
        : '<h2>Henüz oyun yok</h2><p>Yakında burada kanalda oynanan oyunlar listelenecek.</p>';
      el.empty.hidden = false;
    } else if (list.length === 0) {
      el.empty.innerHTML = `<h2>Eşleşen oyun yok</h2><p>Bu arama ve filtrelere uyan bir oyun bulamadık.</p>
        <button type="button" class="btn btn-ghost" data-empty="clear">Filtreleri temizle</button>`;
      el.empty.hidden = false;
    } else {
      el.empty.hidden = true;
    }
  }

  function renderEditing() {
    document.body.classList.toggle('is-editing', prefs.editing);
    el.editBar.hidden = !prefs.editing;
    el.editToggle.setAttribute('aria-pressed', String(prefs.editing));
    const dirty = isDirty();
    el.dirtyPill.textContent = dirty ? 'Yayınlanmamış değişiklik var' : 'Yayındakiyle aynı';
    el.dirtyPill.classList.toggle('is-dirty', dirty);
    const examples = data.games.filter((g) => g.example).length;
    el.clearExamples.hidden = !examples;
    el.clearExamples.querySelector('span').textContent = `Örnekleri sil (${examples})`;
  }

  function render() {
    renderSite();
    renderStats();
    renderFilters();
    renderGrid();
    renderEditing();
  }

  /* ---------- bildirimler ---------- */
  function toast(message, opts = {}) {
    const node = document.createElement('div');
    node.className = `toast${opts.error ? ' is-error' : ''}`;
    node.setAttribute('role', opts.error ? 'alert' : 'status');
    const text = document.createElement('span');
    text.textContent = message;
    node.append(text);
    let timer;
    const close = () => {
      clearTimeout(timer);
      node.remove();
    };
    if (opts.action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opts.action.label;
      btn.addEventListener('click', () => {
        close();
        opts.action.run();
      });
      node.append(btn);
    }
    const openDialogs = $$('dialog[open]');
    const host = openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
    if (el.toasts.parentElement !== host) host.append(el.toasts);
    el.toasts.append(node);
    while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
    timer = setTimeout(close, opts.action ? 7000 : 4200);
  }

  /* ---------- pencereler ---------- */
  function openDialog(d) {
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal();
    } else {
      d.setAttribute('open', '');
    }
  }
  function closeDialog(d) {
    if (typeof d.close === 'function') d.close();
    else d.removeAttribute('open');
  }
  for (const d of [el.detailDialog, el.formDialog, el.settingsDialog, el.dataDialog]) {
    // arka plana tıklayınca kapat
    d.addEventListener('click', (e) => {
      if (e.target === d) closeDialog(d);
      if (e.target.closest('[data-close]')) closeDialog(d);
    });
    // pencere kapanınca açık bildirimler sayfada görünmeye devam etsin
    d.addEventListener('close', () => {
      if (el.toasts.parentElement === d) document.body.append(el.toasts);
    });
  }
  el.detailDialog.addEventListener('close', () => {
    el.detailContent.innerHTML = ''; // video oynuyorsa durdur
  });

  /* ---------- oyun ayrıntısı ---------- */
  let detailId = null;
  const canEmbed = (() => {
    try { return window.self === window.top; } catch (e) { return false; }
  })();

  // "bölüm" her zaman -ü / -ün alır: "3. bölümü oynat", "3. bölümün yayın tarihi"
  const episodeName = (n) => `${n}. bölüm`;
  const episodeAcc = (n) => `${n}. bölümü`;
  const episodeGen = (n) => `${n}. bölümün`;
  const episodeNo = (g, e) => g.episodes.indexOf(e) + 1;
  const openLabel = (e, n) => (hasVideo(e) ? `${episodeAcc(n)} YouTube'da aç` : `${episodeAcc(n)} yeni sekmede aç`);

  function playerHTML(g, ep) {
    const vid = youtubeId(ep.url);
    return `<div class="cover"><iframe src="https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0" title="${esc(g.title)} · ${episodeName(episodeNo(g, ep))}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
  }

  // Üstteki büyük oynatıcı seriye baştan başlatır (ilk yayınlanmış bölüm).
  function mediaHTML(g) {
    const ep = airedEpisodes(g).find(hasVideo);
    if (ep) {
      const n = episodeNo(g, ep);
      const badge = `<span class="play-big">${icon('play')}</span><span class="cover-video">${episodeName(n)}</span>`;
      if (canEmbed) {
        return `<button type="button" class="cover" data-detail="play" data-ep="${esc(ep.id)}" aria-label="${episodeAcc(n)} oynat">${coverHTML(g)}${badge}</button>`;
      }
      return `<a class="cover" href="${esc(episodeLink(ep))}" target="_blank" rel="noopener" aria-label="${episodeAcc(n)} YouTube'da aç">${coverHTML(g)}${badge}</a>`;
    }
    if (safeImage(g.cover) || coverVideo(g.episodes)) return `<div class="cover">${coverHTML(g)}</div>`;
    return `<div class="cover cover-banner">${coverHTML(g)}</div>`;
  }

  // Seri özeti: ilk ve son bölüm tarihi, bölüm sayısı, sıradaki bölüm ve bölümleri tarihine göre gösteren çizgi
  function seriesHTML(g) {
    const info = seriesInfo(g);
    if (!g.episodes.length) return '';
    const span = daysBetween(info.first, info.last);
    const meta = [];
    if (info.aired.length) meta.push(`${info.aired.length} bölüm`);
    if (span > 0) meta.push(`${span} günde`);
    if (info.upcoming.length) meta.push(`${info.upcoming.length} yayınlanacak`);

    const end = (label, iso, cls = '') => `<div class="series-end${cls}">
        <span class="series-label">${label}</span>
        <b>${esc(formatDate(iso))}</b>
        <span class="series-rel">${esc(relativeDay(iso))}</span>
      </div>`;

    let ends = '';
    let track = '';
    if (info.first && info.first === info.last) {
      ends = end(info.dated.length > 1 ? 'Yayınlandı' : 'İlk bölüm', info.first);
    } else if (info.first) {
      ends = end('İlk bölüm', info.first) + end('Son bölüm', info.last, ' is-last');
      const dots = info.dated.map((e) => {
        const pct = (daysBetween(info.first, e.date) / span) * 100;
        return `<span class="series-dot" style="left:${pct.toFixed(2)}%" title="${episodeName(episodeNo(g, e))} · ${esc(formatDate(e.date))}"></span>`;
      }).join('');
      track = `<div class="series-track" aria-hidden="true"><span class="series-line"></span>${dots}</div>`;
    }

    const next = info.upcoming[0];
    const nextHTML = next
      ? `<p class="series-next"><span class="series-label">Sıradaki bölüm</span> <b>${esc(formatDate(next.date))}</b> <span class="series-rel">${esc(relativeDay(next.date))}</span></p>`
      : '';

    const undated = info.aired.length - info.dated.length;
    let note = '';
    if (undated) {
      note = prefs.editing
        ? `<p class="series-note">${undated} bölümün yayın tarihi eksik. Eklemek için “Düzenle”ye bas.</p>`
        : `<p class="series-note">${undated} bölümün yayın tarihi belli değil.</p>`;
    }

    return `<section class="series" aria-labelledby="seriesTitle">
      <div class="series-head">
        <h3 class="eyebrow" id="seriesTitle">Kanaldaki seri</h3>
        <span class="series-meta">${meta.join(' · ')}</span>
      </div>
      ${track}
      ${ends ? `<div class="series-ends">${ends}</div>` : ''}
      ${nextHTML}
      ${note}
    </section>`;
  }

  function episodesHTML(g) {
    if (!g.episodes.length) return '';
    const rows = g.episodes.map((e, i) => {
      const n = i + 1;
      const link = episodeLink(e);
      const upcoming = isUpcoming(e);
      let play = '';
      if (!upcoming && hasVideo(e) && canEmbed) {
        play = `<button type="button" class="ep-play" data-detail="play" data-ep="${esc(e.id)}" aria-label="${episodeAcc(n)} oynat">${icon('play')}</button>`;
      } else if (!upcoming && link) {
        play = `<a class="ep-play" href="${esc(link)}" target="_blank" rel="noopener" aria-label="${openLabel(e, n)}">${icon('play')}</a>`;
      }
      // site içinde oynatılabilen ya da henüz yayınlanmamış bölümler için ayrıca dış bağlantı
      const external = link && (upcoming || (hasVideo(e) && canEmbed))
        ? `<a class="ep-ext" href="${esc(link)}" target="_blank" rel="noopener" aria-label="${openLabel(e, n)}">${icon('external')}</a>`
        : '';
      return `<li class="ep${upcoming ? ' is-upcoming' : ''}" data-ep="${esc(e.id)}">
        <span class="ep-no">${n}</span>
        <div class="ep-main">
          <span class="ep-name">${e.title ? esc(e.title) : episodeName(n)}</span>
          ${upcoming ? '<span class="ep-soon">Yayınlanacak</span>' : ''}
        </div>
        <time class="ep-date" ${e.date ? `datetime="${esc(e.date)}"` : ''}>${e.date ? esc(formatDate(e.date, 'short')) : 'Tarih yok'}</time>
        <span class="ep-actions">${external}${play}</span>
      </li>`;
    }).join('');
    return `<section class="episodes" aria-labelledby="episodesTitle">
      <h3 id="episodesTitle">Bölümler <b>${g.episodes.length}</b></h3>
      <ol class="ep-list">${rows}</ol>
    </section>`;
  }

  // Devam eden seride en yeni bölüme, bitmiş ya da tek bölümlük seride ilk bölüme gider.
  function watchButtonHTML(g) {
    const withLink = airedEpisodes(g).filter((e) => episodeLink(e));
    if (!withLink.length) return '';
    const ongoing = gameState(g) === 'ongoing' && withLink.length > 1;
    // tarihsiz bölümler sona sıralanır; "son bölüm" için tarihi olan en yenisi seçilir
    const dated = withLink.filter((e) => e.date);
    const ep = ongoing ? (dated[dated.length - 1] || withLink[withLink.length - 1]) : withLink[0];
    const n = episodeNo(g, ep);
    const where = hasVideo(ep) ? "YouTube'da izle" : 'izle';
    const label = ongoing ? `Son bölümü ${where}` : `${episodeAcc(n)} ${where}`;
    return `<a class="btn btn-yt" href="${esc(episodeLink(ep))}" target="_blank" rel="noopener">${icon('youtube')}<span>${label}</span></a>`;
  }

  function openDetail(id) {
    const g = findGame(id);
    if (!g) return;
    detailId = id;
    const state = gameState(g);
    const status = {
      played: `<span class="done">Oynandı${g.playedAt ? ` · ${esc(formatDate(g.playedAt))}` : ''}</span>`,
      ongoing: '<span class="ongoing">Devam ediyor</span>',
      todo: g.episodes.length ? 'Yakında başlıyor' : 'Sırada'
    }[state];

    const facts = [
      ['Kategori', esc(g.category)],
      ['Platform', esc(g.platform || '—')],
      ['Puanım', g.rating ? starsHTML(g.rating) : 'Puan yok'],
      ['Durum', status],
      ['Listeye eklendi', esc(formatDate(g.addedAt) || '—')]
    ];

    const actions = [];
    if (!prefs.editing) actions.push(watchButtonHTML(g));
    if (prefs.editing) {
      actions.push(`<button type="button" class="tick" data-detail="toggle" aria-pressed="${g.played}"><span class="tick-box">${icon('check')}</span>Oynadım</button>`);
      actions.push(`<button type="button" class="btn btn-ghost" data-detail="add-episode">${icon('plus')}<span>Bölüm ekle</span></button>`);
      actions.push(`<button type="button" class="btn btn-ghost" data-detail="edit">${icon('edit')}<span>Düzenle</span></button>`);
    }
    const actionsHTML = actions.filter(Boolean).join('');

    el.detailContent.innerHTML = `
      <div class="detail-media">
        <div id="detailPlayer">${mediaHTML(g)}</div>
        <button type="button" class="icon-btn detail-close" data-close aria-label="Kapat">${icon('x')}</button>
      </div>
      <div class="detail-body">
        <div class="detail-title">
          ${g.example ? '<span class="example-chip">Örnek</span>' : ''}
          <h2 id="detailTitle">${esc(g.title)}</h2>
        </div>
        <dl class="detail-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${seriesHTML(g)}
        <p class="detail-desc${g.description ? '' : ' is-empty'}">${g.description ? esc(g.description) : 'Bu oyun için henüz açıklama yazılmadı.'}</p>
        ${episodesHTML(g)}
        ${actionsHTML ? `<div class="detail-actions">${actionsHTML}</div>` : ''}
      </div>`;
    openDialog(el.detailDialog);
  }

  function playEpisode(g, epId) {
    const ep = g.episodes.find((e) => e.id === epId);
    if (!ep || !hasVideo(ep)) return;
    $('#detailPlayer', el.detailContent).innerHTML = playerHTML(g, ep);
    for (const row of $$('.ep', el.detailContent)) row.classList.toggle('is-playing', row.dataset.ep === epId);
    el.detailDialog.scrollTo({ top: 0, behavior: 'smooth' });
  }

  el.detailContent.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-detail]');
    if (!btn) return;
    const g = findGame(detailId);
    if (!g) return;
    const action = btn.dataset.detail;
    if (action === 'play') {
      playEpisode(g, btn.dataset.ep);
    } else if (action === 'toggle') {
      togglePlayed(g.id);
      openDetail(g.id);
    } else if (action === 'edit' || action === 'add-episode') {
      closeDialog(el.detailDialog);
      openForm(g.id, { addEpisode: action === 'add-episode' });
    }
  });

  /* ---------- işlemler ---------- */
  function togglePlayed(id) {
    const g = findGame(id);
    if (!g) return;
    g.played = !g.played;
    g.playedAt = g.played ? todayISO() : null;
    justToggled = g.played ? g.id : null;
    commit();
    if (g.played) toast(`“${g.title}” oynandı olarak işaretlendi.`);
  }

  function deleteGame(id) {
    const index = data.games.findIndex((g) => g.id === id);
    if (index < 0) return;
    const [removed] = data.games.splice(index, 1);
    commit();
    toast(`“${removed.title}” silindi.`, {
      action: {
        label: 'Geri al',
        run: () => {
          if (findGame(removed.id)) return; // başka bir yoldan zaten geri gelmiş
          data.games.splice(Math.min(index, data.games.length), 0, removed);
          commit();
        }
      }
    });
  }

  function clearExampleGames() {
    const removed = data.games.map((g, index) => ({ g, index })).filter((x) => x.g.example);
    if (!removed.length) return;
    data.games = data.games.filter((g) => !g.example);
    commit();
    toast(`${removed.length} örnek oyun silindi.`, {
      action: {
        label: 'Geri al',
        // yalnızca silinen örnekler geri eklenir; arada eklenen ya da silinen oyunlara dokunulmaz
        run: () => {
          for (const { g, index } of removed) {
            if (!findGame(g.id)) data.games.splice(Math.min(index, data.games.length), 0, g);
          }
          commit();
        }
      }
    });
  }

  function setEditing(on) {
    prefs.editing = on;
    savePrefs();
    render();
    if (on) toast('Düzenleme modu açık. Değişiklikler bu tarayıcıda saklanır; herkese göstermek için “Yayınla”yı kullan.');
  }

  /* ---------- oyun formu ---------- */
  const f = {
    title: $('#f-title'),
    category: $('#f-category'),
    platform: $('#f-platform'),
    desc: $('#f-desc'),
    episodes: $('#epEditor'),
    addEpisode: $('#addEpisode'),
    cover: $('#f-cover'),
    coverFile: $('#f-cover-file'),
    coverPreview: $('#coverPreview'),
    coverHint: $('#coverHint'),
    coverClear: $('#coverClear'),
    played: $('#f-played'),
    playedAt: $('#f-played-at'),
    stars: $('#starInput'),
    deleteBtn: $('#deleteBtn'),
    heading: $('#formTitle'),
    submit: $('#formSubmit')
  };
  let formId = null;
  let formCover = '';

  function fillDatalist(listEl, base, extra) {
    const values = Array.from(new Set([...base, ...extra].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr'));
    listEl.innerHTML = values.map((v) => `<option value="${esc(v)}"></option>`).join('');
  }

  function setRating(value) {
    const radio = $(`#r${value}`) || $('#r0');
    radio.checked = true;
    updateStars();
  }
  function updateStars() {
    const checked = $('input[name="rating"]:checked', f.stars);
    const v = checked ? Number(checked.value) : 0;
    for (const label of $$('label[data-star]', f.stars)) label.classList.toggle('on', Number(label.dataset.star) <= v);
  }
  f.stars.addEventListener('change', updateStars);

  /* bölüm satırları */
  // Bir satır kaydedilir: linki ya da başlığı varsa, mevcut bir bölümse ya da tarihi elle seçildiyse.
  // "Bölüm ekle" ile açılıp hiç dokunulmayan satır (yalnızca bugünün tarihi) yok sayılır.
  function readEpisodeRows() {
    return $$('.ep-row', f.episodes).map((row, i) => {
      const r = {
        row,
        n: i + 1,
        id: row.dataset.id,
        url: $('.ep-url', row).value.trim(),
        title: $('.ep-title-input', row).value.trim(),
        date: $('.ep-date-input', row).value
      };
      const kept = row.dataset.existing === '1' || row.dataset.touched === '1';
      // linki, başlığı ve tarihi tamamen silinen satır da kaldırılmış sayılır
      r.counts = Boolean(r.url || r.title || (kept && r.date));
      return r;
    });
  }

  function renumberEpisodeRows() {
    $$('.ep-row', f.episodes).forEach((row, i) => {
      const n = i + 1;
      $('.ep-row-no', row).textContent = n;
      $('.ep-url', row).setAttribute('aria-label', `${episodeGen(n)} YouTube linki`);
      $('.ep-title-input', row).setAttribute('aria-label', `${episodeGen(n)} başlığı`);
      $('.ep-title-input', row).placeholder = `Başlık (boşsa “${episodeName(n)}”)`;
      $('.ep-date-input', row).setAttribute('aria-label', `${episodeGen(n)} yayın tarihi`);
      $('.ep-remove', row).setAttribute('aria-label', `${episodeName(n)} satırını kaldır`);
    });
  }

  // YouTube 23 Nisan 2005'te açıldı; tarih seçici bundan öncesini önermez.
  const FIRST_YOUTUBE_DAY = '2005-04-23';

  function addEpisodeRow(ep = {}, opts = {}) {
    const id = ep.id || uid();
    const li = document.createElement('li');
    li.className = 'ep-row';
    li.dataset.id = id;
    if (opts.existing) li.dataset.existing = '1';
    // eski sürümden gelen tarihsiz bölüm, tarih seçilmeden de kaydedilebilsin
    if (opts.existing && !ep.date) li.dataset.undatedOk = '1';
    const key = `r${uid()}`; // sayfa içi kimlik; bölüm kimliğinde boşluk ya da nokta olabilir
    li.innerHTML = `
      <span class="ep-row-no"></span>
      <div class="ep-row-fields">
        <input class="ep-url" id="ep-url-${key}" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" value="${esc(ep.url || '')}">
        <input class="ep-title-input" id="ep-title-${key}" type="text" maxlength="120" value="${esc(ep.title || '')}">
        <input class="ep-date-input" id="ep-date-${key}" type="date" min="${FIRST_YOUTUBE_DAY}" max="9999-12-31" value="${esc(ep.date || '')}">
        <p class="field-error ep-row-error" id="ep-err-${key}" hidden></p>
      </div>
      <button type="button" class="icon-btn ep-remove">${icon('x')}</button>`;
    f.episodes.append(li);
    renumberEpisodeRows();
    return li;
  }

  function setInvalid(input, errorId, message = '') {
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorId);
    input.dataset.error = message;
  }
  function setValid(input) {
    input.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    delete input.dataset.error;
  }

  // Satırın mesajı, o satırda hâlâ hatalı olan alanların mesajlarından yeniden kurulur.
  function updateRowError(row) {
    const err = $('.ep-row-error', row);
    const messages = $$('input.is-invalid', row).map((i) => i.dataset.error).filter(Boolean);
    const n = $$('.ep-row', f.episodes).indexOf(row) + 1;
    err.textContent = messages.length ? `${episodeName(n)}: ${messages.join(' ')}` : '';
    err.hidden = !messages.length;
  }

  function clearRowErrors(row) {
    for (const input of $$('input', row)) setValid(input);
    updateRowError(row);
  }

  function clearEpisodeErrors() {
    for (const row of $$('.ep-row', f.episodes)) clearRowErrors(row);
  }

  // YouTube'un herkese açık oEmbed adresinden video başlığını dener; olmazsa sessizce geçer.
  async function suggestEpisodeTitle(row) {
    const urlInput = $('.ep-url', row);
    const titleInput = $('.ep-title-input', row);
    const url = urlInput.value.trim();
    if (!youtubeId(url) || titleInput.value.trim() || typeof fetch !== 'function') return;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
        controller ? { signal: controller.signal } : undefined);
      if (!res.ok) return;
      const info = await res.json();
      // kullanıcı bu arada yazdıysa ya da link değiştiyse dokunma
      if (info && info.title && !titleInput.value.trim() && urlInput.value.trim() === url) {
        titleInput.value = String(info.title).slice(0, 120);
      }
    } catch (e) {
      /* ağ yok ya da tarayıcı izin vermedi; başlık elle yazılabilir */
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function updateCoverPreview() {
    const episodes = readEpisodeRows();
    const preview = { title: f.title.value.trim() || 'Yeni oyun', cover: formCover, episodes };
    f.coverPreview.innerHTML = coverHTML(preview);
    const uploaded = formCover.startsWith('data:');
    if (uploaded) f.coverHint.textContent = 'Bilgisayardan yüklenen görsel kullanılıyor.';
    else if (formCover) f.coverHint.textContent = 'Linkteki görsel kullanılıyor.';
    else if (coverVideo(episodes)) f.coverHint.textContent = 'Görsel yok; ilk bölümün küçük resmi kullanılıyor.';
    else f.coverHint.textContent = 'Boş bırakırsan ilk bölümün küçük resmi, o da yoksa otomatik bir kapak kullanılır.';
    f.coverClear.hidden = !formCover;
  }

  // Son yayınlanmış bölümün tarihi (formdaki kaydedilecek satırlara göre)
  function latestAiredDate(rows) {
    const today = todayISO();
    const dates = rows.filter((r) => r.counts && isValidDay(r.date) && r.date <= today).map((r) => r.date).sort();
    return dates.length ? dates[dates.length - 1] : '';
  }

  // Bitirme tarihi boşsa son yayınlanan bölümün tarihi, bölüm yoksa bugün önerilir.
  function syncPlayedAt() {
    f.playedAt.disabled = !f.played.checked;
    if (f.played.checked && !f.playedAt.value) f.playedAt.value = latestAiredDate(readEpisodeRows()) || todayISO();
  }

  function clearErrors() {
    for (const id of ['f-title-error', 'f-category-error']) $(`#${id}`).hidden = true;
    setValid(f.title);
    setValid(f.category);
    clearEpisodeErrors();
  }

  function showError(input, errorId) {
    setInvalid(input, errorId);
    $(`#${errorId}`).hidden = false;
  }

  function openForm(id, opts = {}) {
    const g = id ? findGame(id) : null;
    formId = g ? g.id : null;
    clearErrors();
    fillDatalist($('#categoryList'), CATEGORY_SUGGESTIONS, data.games.map((x) => x.category));
    fillDatalist($('#platformList'), PLATFORM_SUGGESTIONS, data.games.map((x) => x.platform));

    f.heading.textContent = g ? 'Oyunu düzenle' : 'Oyun ekle';
    f.submit.textContent = g ? 'Değişiklikleri kaydet' : 'Oyunu ekle';
    f.deleteBtn.hidden = !g;
    f.title.value = g ? g.title : '';
    f.category.value = g ? g.category : (prefs.category !== 'all' ? prefs.category : '');
    f.platform.value = g ? g.platform : '';
    f.desc.value = g ? g.description : '';
    f.episodes.innerHTML = '';
    for (const ep of g ? g.episodes : []) addEpisodeRow(ep, { existing: true });
    let focusTarget = f.title;
    if (opts.addEpisode) focusTarget = $('.ep-url', addEpisodeRow({ date: todayISO() }));
    formCover = g ? g.cover : '';
    f.cover.value = formCover.startsWith('data:') ? '' : formCover;
    f.coverFile.value = '';
    f.played.checked = g ? g.played : false;
    f.playedAt.value = g && g.playedAt ? String(g.playedAt).slice(0, 10) : '';
    setRating(g ? g.rating : 0);
    syncPlayedAt();
    updateCoverPreview();
    openDialog(el.formDialog);
    setTimeout(() => {
      focusTarget.focus();
      if (opts.addEpisode) focusTarget.scrollIntoView({ block: 'center' });
    }, 30);
  }

  // yazmaya başlayınca o alanın hata mesajı kalksın
  for (const [input, errorId] of [[f.title, 'f-title-error'], [f.category, 'f-category-error']]) {
    input.addEventListener('input', () => {
      setValid(input);
      $(`#${errorId}`).hidden = true;
    });
  }
  f.played.addEventListener('change', syncPlayedAt);
  f.title.addEventListener('input', updateCoverPreview);

  f.addEpisode.addEventListener('click', () => {
    const row = addEpisodeRow({ date: todayISO() });
    $('.ep-url', row).focus();
  });
  f.episodes.addEventListener('click', (e) => {
    const btn = e.target.closest('.ep-remove');
    if (!btn) return;
    const row = btn.closest('.ep-row');
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    renumberEpisodeRows();
    clearEpisodeErrors();
    updateCoverPreview();
    (next ? $('.ep-url', next) : f.addEpisode).focus();
  });
  f.episodes.addEventListener('input', (e) => {
    const row = e.target.closest('.ep-row');
    if (!row) return;
    // düzeltilen alanın hatası kalksın; aynı satırdaki diğer hatalar görünmeye devam etsin
    if (e.target.classList.contains('is-invalid')) {
      setValid(e.target);
      updateRowError(row);
    }
    if (e.target.classList.contains('ep-date-input')) row.dataset.touched = '1';
    if (e.target.classList.contains('ep-url')) updateCoverPreview();
  });
  f.episodes.addEventListener('change', (e) => {
    const row = e.target.closest('.ep-row');
    if (!row) return;
    if (e.target.classList.contains('ep-date-input')) row.dataset.touched = '1';
    if (e.target.classList.contains('ep-url')) suggestEpisodeTitle(row);
  });
  f.cover.addEventListener('input', () => {
    formCover = f.cover.value.trim();
    updateCoverPreview();
  });
  f.coverClear.addEventListener('click', () => {
    formCover = '';
    f.cover.value = '';
    f.coverFile.value = '';
    updateCoverPreview();
  });

  // Yüklenen görseli küçültüp JPEG'e çevirir; tarayıcı depolaması çabuk dolmasın diye.
  function resizeImage(file, maxSide = 720) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error('Görsel dosyası değil'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Görsel okunamadı'));
      };
      img.src = url;
    });
  }

  f.coverFile.addEventListener('change', async () => {
    const file = f.coverFile.files && f.coverFile.files[0];
    if (!file) return;
    try {
      formCover = await resizeImage(file);
      f.cover.value = '';
      updateCoverPreview();
    } catch (e) {
      toast('Bu dosya görsel olarak açılamadı. JPG, PNG ya da WebP bir dosya seç.', { error: true });
    }
  });

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();
    const title = f.title.value.trim();
    const category = f.category.value.trim();
    clearEpisodeErrors();
    let firstInvalid = null;
    if (!title) {
      showError(f.title, 'f-title-error');
      firstInvalid = firstInvalid || f.title;
    }
    if (!category) {
      showError(f.category, 'f-category-error');
      firstInvalid = firstInvalid || f.category;
    }
    // dokunulmamış boş satırlar yok sayılır (bkz. readEpisodeRows)
    const rows = readEpisodeRows().filter((r) => r.counts);
    for (const r of rows) {
      const urlInput = $('.ep-url', r.row);
      const dateInput = $('.ep-date-input', r.row);
      const errorId = $('.ep-row-error', r.row).id;
      // "youtube.com/watch?v=…" gibi şemasız YouTube linkleri sessizce tamamlanır
      if (r.url && !/^[a-z][a-z0-9+.-]*:/i.test(r.url) && youtubeId(r.url)) {
        r.url = `https://${r.url.replace(/^\/+/, '')}`;
        urlInput.value = r.url;
      }
      if (r.url && !safeLink(r.url)) {
        setInvalid(urlInput, errorId, 'Link https:// ile başlamalı.');
        firstInvalid = firstInvalid || urlInput;
      }
      if (!r.date && r.row.dataset.undatedOk !== '1') {
        setInvalid(dateInput, errorId, 'Yayın tarihini seç.');
        firstInvalid = firstInvalid || dateInput;
      } else if (r.date && !isValidDay(r.date)) {
        setInvalid(dateInput, errorId, 'Geçerli bir tarih seç (gün.ay.yıl).');
        firstInvalid = firstInvalid || dateInput;
      }
      updateRowError(r.row);
    }
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ block: 'center' });
      return;
    }

    const checked = $('input[name="rating"]:checked', f.stars);
    const played = f.played.checked;
    const values = {
      title,
      category,
      platform: f.platform.value.trim(),
      description: f.desc.value.trim(),
      episodes: sortEpisodes(rows.map((r) => normalizeEpisode(r))),
      cover: formCover,
      rating: checked ? Number(checked.value) : 0,
      played,
      playedAt: played ? (f.playedAt.value || latestAiredDate(rows) || todayISO()) : null
    };

    const existing = formId ? findGame(formId) : null;
    if (existing) {
      if (values.played && !existing.played) justToggled = existing.id;
      Object.assign(existing, values);
      delete existing.example; // elle düzenlenen oyun artık örnek sayılmaz
      toast(`“${title}” güncellendi.`);
    } else {
      const game = normalizeGame({ ...values, id: uid(), addedAt: new Date().toISOString() });
      data.games.push(game);
      if (game.played) justToggled = game.id;
      // yeni oyun filtrelerde gizli kalmasın
      const hidden = (prefs.status !== 'all' && prefs.status !== gameState(game)) ||
        (prefs.category !== 'all' && prefs.category !== game.category);
      if (hidden) {
        prefs.status = 'all';
        prefs.category = 'all';
        savePrefs();
      }
      toast(`“${title}” arşive eklendi.`);
    }
    closeDialog(el.formDialog);
    commit();
  });

  f.deleteBtn.addEventListener('click', () => {
    if (!formId) return;
    closeDialog(el.formDialog);
    deleteGame(formId);
  });

  /* ---------- site ayarları ---------- */
  const s = {
    channel: $('#s-channel'),
    title: $('#s-title'),
    tagline: $('#s-tagline'),
    youtube: $('#s-youtube'),
    github: $('#s-github')
  };

  function openSettings() {
    clearSettingsErrors();
    s.channel.value = data.site.channelName;
    s.title.value = data.site.title;
    s.tagline.value = data.site.tagline;
    s.youtube.value = data.site.youtubeUrl;
    s.github.value = data.site.githubEditUrl;
    openDialog(el.settingsDialog);
  }
  function clearSettingsErrors() {
    $('#s-youtube-error').hidden = true;
    s.youtube.classList.remove('is-invalid');
  }

  el.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearSettingsErrors();
    const youtube = s.youtube.value.trim();
    if (youtube && !safeLink(youtube)) {
      s.youtube.classList.add('is-invalid');
      $('#s-youtube-error').hidden = false;
      s.youtube.focus();
      return;
    }
    data.site = {
      channelName: s.channel.value.trim() || SITE_DEFAULTS.channelName,
      title: s.title.value.trim() || SITE_DEFAULTS.title,
      tagline: s.tagline.value.trim(),
      youtubeUrl: youtube,
      githubEditUrl: s.github.value.trim()
    };
    closeDialog(el.settingsDialog);
    commit();
    toast('Site ayarları kaydedildi.');
  });

  /* ---------- yayınla / yedekle ---------- */
  function buildExport() {
    const version = Date.now();
    data.baseVersion = version;
    persist();
    const payload = { version, site: data.site, games: data.games };
    return [
      '// Oyun Arşivi verisi. Sitedeki "Yayınla" penceresinden oluşturuldu.',
      "// Bu dosyayı GitHub'da güncellediğinde ziyaretçiler yeni listeyi görür.",
      `window.SITE_DATA = ${JSON.stringify(payload, null, 2)};`,
      ''
    ].join('\n');
  }

  function renderDataDialog() {
    const dirty = isDirty();
    const status = $('#dataStatus');
    status.classList.toggle('is-dirty', dirty);
    status.textContent = dirty
      ? `Bu tarayıcıda yayınlanmamış değişiklikler var. Burada ${data.games.length} oyun, yayındaki sitede ${published.games.length} oyun görünüyor.`
      : `Bu tarayıcıdaki liste yayındaki siteyle aynı (${data.games.length} oyun).`;
    const gh = safeLink(data.site.githubEditUrl);
    const ghLink = $('#githubEditLink');
    ghLink.hidden = !gh;
    if (gh) ghLink.href = gh;
    $('#exportText').hidden = true;
    $('#resetLocal').disabled = !dirty;
  }

  function openDataDialog() {
    renderDataDialog();
    openDialog(el.dataDialog);
  }

  $('#copyExport').addEventListener('click', () => {
    const text = buildExport();
    const fallback = () => {
      const ta = $('#exportText');
      ta.value = text;
      ta.hidden = false;
      ta.focus();
      ta.select();
      toast('Otomatik kopyalanamadı. Metin seçili; Ctrl+C (telefonda “Kopyala”) ile kopyala.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast("Liste kopyalandı. Şimdi GitHub'da data/games.js dosyasına yapıştır."),
        fallback
      );
    } else {
      fallback();
    }
  });

  $('#downloadExport').addEventListener('click', () => {
    const blob = new Blob([buildExport()], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'games.js';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("games.js indirildi. GitHub'da data/ klasörüne yükleyip eskisinin yerine koy.");
  });

  function parseImport(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('JSON bulunamadı');
    const obj = JSON.parse(text.slice(start, end + 1));
    if (!obj || !Array.isArray(obj.games)) throw new Error('Oyun listesi yok');
    return obj;
  }

  function replaceData(next, message) {
    const previous = data;
    data = next;
    commit();
    renderDataDialog();
    toast(message, {
      action: {
        label: 'Geri al',
        run: () => {
          data = previous;
          commit();
          renderDataDialog();
        }
      }
    });
  }

  $('#importFile').addEventListener('change', async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const obj = parseImport(await file.text());
      const next = normalizeData(obj);
      next.baseVersion = Math.max(data.baseVersion || 0, published.version);
      replaceData(next, `${next.games.length} oyunluk liste yüklendi.`);
    } catch (err) {
      toast('Bu dosya okunamadı. Siteden indirilen games.js ya da .json dosyasını seç.', { error: true });
    }
  });

  $('#resetLocal').addEventListener('click', () => {
    const next = clone(published);
    next.baseVersion = published.version;
    replaceData(next, 'Yayındaki listeye dönüldü.');
  });

  /* ---------- olaylar ---------- */
  el.grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    const btn = e.target.closest('[data-action]');
    const action = btn ? btn.dataset.action : 'open';
    if (action === 'toggle') togglePlayed(id);
    else if (action === 'edit') openForm(id);
    else if (action === 'category') {
      prefs.category = btn.dataset.category;
      savePrefs();
      render();
    } else openDetail(id);
  });

  // kırık görsel linklerinde çizilen kapak görünsün
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.closest('.cover')) t.remove();
  }, true);

  el.chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    prefs.category = btn.dataset.category;
    savePrefs();
    render();
  });

  $('#statusFilter').addEventListener('change', (e) => {
    prefs.status = e.target.value;
    savePrefs();
    render();
  });

  el.sort.addEventListener('change', () => {
    prefs.sort = el.sort.value;
    savePrefs();
    renderGrid();
  });

  el.search.addEventListener('input', () => {
    searchText = el.search.value;
    renderGrid();
  });

  el.empty.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-empty]');
    if (!btn) return;
    if (btn.dataset.empty === 'add') openForm(null);
    if (btn.dataset.empty === 'clear') {
      searchText = '';
      el.search.value = '';
      prefs.status = 'all';
      prefs.category = 'all';
      savePrefs();
      render();
    }
  });

  el.themeBtn.addEventListener('click', () => {
    prefs.theme = isDarkNow() ? 'light' : 'dark';
    savePrefs();
    applyTheme();
  });
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

  el.editToggle.addEventListener('click', () => setEditing(!prefs.editing));
  $('#editDone').addEventListener('click', () => setEditing(false));
  $('#addBtn').addEventListener('click', () => openForm(null));
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#publishBtn').addEventListener('click', openDataDialog);
  el.clearExamples.addEventListener('click', clearExampleGames);

  // Adres #duzenle ile açılırsa düzenleme modu açılır (ör. siteadresi/#duzenle)
  if (location.hash === '#duzenle') prefs.editing = true;

  document.documentElement.lang = 'tr';
  applyTheme();
  render();
})();
