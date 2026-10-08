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
    channelName: 'Kurabiyeli Pişmaniye',
    title: 'Oyun Arşivi',
    tagline: '',
    youtubeUrl: '',
    githubEditUrl: ''
  };

  // Firebase ayarı varsa site "bulut" modunda çalışır: liste Firestore'dan okunur, sahibi giriş yapınca
  // her değişiklik anında kaydedilir. Ayar yoksa "yerel" mod: liste data/games.js'ten okunur.
  const CONFIG = window.SITE_CONFIG || {};
  const CLOUD_CONFIGURED = Boolean(CONFIG.firebase && CONFIG.firebase.apiKey);
  const mode = CLOUD_CONFIGURED ? 'cloud' : 'local';

  /* ---------- yardımcılar ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  const lower = (s) => String(s || '').toLocaleLowerCase('tr');
  // Karşılaştırma ve arama için sadeleştirme: büyük/küçük harf, Türkçe I/ı ve aksanlar fark etmez
  // ("HADES II" = "hades ii", "sehir" = "Şehir").
  const fold = (s) => lower(s).replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  // Bir tarihin (Date, zaman damgası ya da ISO metni) yerel gün karşılığı: YYYY-AA-GG
  function localDay(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const todayISO = () => localDay(new Date());

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
  // Tek parça bir http(s) adresi (boşluk ya da HTML içermeyen)
  const safeLink = (url) => {
    const u = String(url || '').trim();
    return /^https?:\/\/[^\s<>"']+$/i.test(u) ? u : '';
  };

  // embed kodunda & işareti &amp; olarak yazılır
  const unescapeAmp = (s) => String(s || '').replace(/&amp;/gi, '&');

  function youtubeId(url) {
    // "videoseries" (oynatma listesi) ve "live_stream" 11 harfli olsa da video kimliği değildir
    const m = unescapeAmp(url).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))(?!videoseries|live_stream)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  const isYoutubeUrl = (url) => /(?:youtube(?:-nocookie)?\.com|youtu\.be)\//i.test(String(url || ''));

  // Şeması yazılmamış tek parça adres (ör. "youtube.com/@kanal") için başına https:// eklenir
  function withScheme(url) {
    const u = String(url || '').trim();
    if (!u || /^[a-z][a-z0-9+.-]*:/i.test(u) || !/^[^\s<>"']+$/.test(u)) return u;
    return /^(?:\/\/)?[\w-]+(?:\.[\w-]+)+(?:[/?#]|$)/.test(u) ? `https://${u.replace(/^\/+/, '')}` : u;
  }

  // Linkteki başlangıç zamanı (t=95, t=95s, t=1h2m3s ya da start=95) saniye olarak
  function youtubeStart(url) {
    const m = unescapeAmp(url).match(/[?&#](?:t|start)=([0-9hms]+)/i);
    if (!m) return 0;
    const v = m[1].toLowerCase();
    if (/^\d+s?$/.test(v)) return parseInt(v, 10);
    const part = (unit) => {
      const x = v.match(new RegExp(`(\\d+)${unit}`));
      return x ? parseInt(x[1], 10) : 0;
    };
    return part('h') * 3600 + part('m') * 60 + part('s');
  }

  // YouTube linkini temiz bir izleme adresine çevirir; başlangıç zamanını korur.
  function canonicalYoutube(url) {
    const vid = youtubeId(url);
    if (!vid) return '';
    const t = youtubeStart(url);
    return `https://www.youtube.com/watch?v=${vid}${t ? `&t=${t}s` : ''}`;
  }

  // Bölüm alanına yapıştırılanı tek bir linke çevirir:
  // şemasız adres → https:// eklenir (list, index, t gibi parametreler korunur); embed kodu → izleme ya da liste adresi;
  // linkli paylaşım metni → metindeki link. Çevrilemezse olduğu gibi döner (doğrulama uyarır).
  function cleanEpisodeUrl(raw) {
    const u = String(raw || '').trim();
    if (!u || safeLink(u)) return u;
    const schemed = withScheme(u);
    if (safeLink(schemed)) return schemed;
    const text = unescapeAmp(u);
    if (!/<iframe/i.test(text)) {
      const inText = text.match(/https?:\/\/[^\s<>"']+/i);
      if (inText) return inText[0];
    }
    const video = canonicalYoutube(text);
    if (video) return video;
    const list = (text.match(/[?&]list=([A-Za-z0-9_-]+)/) || [])[1];
    if (list && isYoutubeUrl(text)) return `https://www.youtube.com/playlist?list=${list}`;
    return u;
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

  // Oyun adından linkte kullanılacak kısa kimlik: "Red Dead Redemption 2" → red-dead-redemption-2
  const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');

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
      steamUrl: String(g.steamUrl || '').trim(), // elle girilen mağaza linki; "yok": link gösterilmez
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
    return safeLink(e.url) || canonicalYoutube(e.url);
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
          const untouched = pg && ['title', 'category', 'platform', 'description', 'cover', 'rating', 'played', 'playedAt']
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

  /* ---------- kaydetme ---------- */
  // change: { games: [kimlik…], deleted: [kimlik…], site: true } ya da { all: true }
  let cloudApi = null;          // window.cloud (bulut modunda, bağlantı kurulunca)
  let owner = null;             // giriş yapan sahibi { uid, email }
  let cloudGames = null;        // Firestore'daki son oyun listesi (null: henüz gelmedi)
  let cloudSite;                // Firestore'daki site ayarları (undefined: gelmedi, null: yok)
  let cloudError = null;        // { code, message } okuma hatası (ör. kurallar yayınlanmamış)
  let gamesFromCache = false;   // son oyun listesi tarayıcının önbelleğinden mi geldi (sunucudan henüz gelmedi)
  let pendingSaves = 0;
  let saveFailed = false;
  const pendingDeletes = new Map(); // geri alınabilsin diye birkaç saniye bekletilen silmeler

  // Yeni oyunun kimliği adından türetilir (oyunun linkinde görünür: #oyun/elden-ring) ve ad sonradan
  // değişse de aynı kalır. Kullanımdaki ya da silinmeyi bekleyen bir kimlikse sonuna -2, -3… eklenir.
  function newGameId(title) {
    const base = slugify(title) || 'oyun';
    let id = base;
    for (let n = 2; findGame(id) || pendingDeletes.has(id); n++) id = `${base}-${n}`;
    return id;
  }

  // Bulutta henüz hiç veri yoksa (site ayarı ve oyun yok) kurulum tamamlanmamış sayılır.
  const cloudInitialized = () => Boolean(cloudSite) || Boolean(cloudGames && cloudGames.length);
  const cloudLive = () => mode === 'cloud' && Boolean(cloudApi) && cloudGames !== null && !cloudError;

  function cloudErrorText(err) {
    const code = (err && err.code) || '';
    if (code === 'permission-denied') return 'Kaydedilemedi: yetki yok. Giriş yaptığından ve güvenlik kurallarının yayınlandığından emin ol (Kurulum).';
    if (code === 'unavailable') return 'Kaydedilemedi: internet bağlantısı yok. Bağlantı gelince otomatik denenir.';
    if (code === 'resource-exhausted') return 'Kaydedilemedi: günlük ücretsiz kullanım sınırı dolmuş olabilir. Yarın tekrar dene.';
    if (code === 'invalid-argument') return 'Kaydedilemedi: veri çok büyük. Daha küçük bir görsel dene.';
    return `Kaydedilemedi (${code || 'bilinmeyen hata'}). Biraz sonra tekrar dene.`;
  }

  function track(promise) {
    pendingSaves += 1;
    saveFailed = false;
    renderSaveState();
    return Promise.resolve(promise)
      .catch((err) => {
        saveFailed = true;
        toast(cloudErrorText(err), { error: true });
        throw err;
      })
      .finally(() => {
        pendingSaves -= 1;
        renderSaveState();
      });
  }
  const quiet = (p) => p.catch(() => {});

  function saveToCloud(change) {
    if (!cloudApi) {
      toast('Buluta bağlanılamadı; değişiklik kaydedilmedi. Sayfayı yenileyip tekrar dene.', { error: true });
      return;
    }
    // bulut boşken tek bir oyunu kaydetmek, listenin geri kalanını kaybettirirdi: önce hepsini aktar
    if (change.all || !cloudInitialized()) {
      quiet(track(cloudApi.replaceGames(data.games)));
      quiet(track(cloudApi.saveSite(data.site)));
      return;
    }
    for (const id of change.games || []) {
      const g = findGame(id);
      if (g) quiet(track(cloudApi.saveGame(g)));
    }
    for (const id of change.deleted || []) quiet(track(cloudApi.deleteGame(id)));
    if (change.site) quiet(track(cloudApi.saveSite(data.site)));
  }

  function commit(change = { all: true }) {
    if (mode === 'cloud') saveToCloud(change);
    else persist();
    render();
  }

  // Bulutta silme, "Geri al" süresi bitince yapılır; bu sürede oyun listede gizlenir.
  function scheduleCloudDelete(ids, delay = 7500) {
    for (const id of ids) {
      clearTimeout(pendingDeletes.get(id));
      pendingDeletes.set(id, setTimeout(() => {
        pendingDeletes.delete(id);
        if (cloudApi) quiet(track(cloudApi.deleteGame(id)));
      }, delay));
    }
  }
  function cancelCloudDelete(ids) {
    for (const id of ids) {
      clearTimeout(pendingDeletes.get(id));
      pendingDeletes.delete(id);
    }
  }
  // sayfa kapanırken bekleyen silmeleri hemen gönder
  window.addEventListener('pagehide', () => {
    for (const [id, timer] of pendingDeletes) {
      clearTimeout(timer);
      if (cloudApi) quiet(cloudApi.deleteGame(id));
    }
    pendingDeletes.clear();
  });

  /* ---------- tercihler ---------- */
  const prefs = Object.assign(
    { editing: false, theme: '', status: 'all', category: 'all', sort: 'recent', wheelPools: ['todo'], wheelSound: true },
    storageGet(PREFS_KEY) || {}
  );
  if (!['all', 'played', 'ongoing', 'todo'].includes(prefs.status)) prefs.status = 'all';
  if (!Array.isArray(prefs.wheelPools)) prefs.wheelPools = ['todo'];
  prefs.wheelPools = prefs.wheelPools.filter((p) => p === 'todo' || p === 'ongoing');
  const savePrefs = () => storageSet(PREFS_KEY, prefs);
  // Yerel modda herkes kendi tarayıcısında düzenleyebilir; bulut modunda yalnızca giriş yapan sahibi.
  const canEdit = () => mode === 'local' || Boolean(owner && cloudApi);
  const isEditing = () => prefs.editing && canEdit();
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
    setupBtn: $('#setupBtn'),
    logoutBtn: $('#logoutBtn'),
    publishBtn: $('#publishBtn'),
    loginDialog: $('#loginDialog'),
    setupDialog: $('#setupDialog'),
    setupBody: $('#setupBody'),
    lightbox: $('#lightbox'),
    nowSection: $('#nowSection'),
    nowBody: $('#nowBody'),
    nowPlayer: $('#nowPlayer'),
    nowInfo: $('#nowInfo'),
    nowMore: $('#nowMore'),
    schedSection: $('#schedSection'),
    schedCount: $('#schedCount'),
    schedList: $('#schedList'),
    schedToggle: $('#schedToggle'),
    latestSection: $('#latestSection'),
    latestTitle: $('#latestTitle'),
    latestBody: $('#latestBody'),
    latestChannel: $('#latestChannel'),
    tabs: $('#tabs'),
    gamesPanel: $('#gamesPanel'),
    sugPanel: $('#suggestionsPanel'),
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
    if (isEditing()) {
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
    const q = fold(searchText);
    const list = data.games.filter((g) => {
      if (prefs.status !== 'all' && gameState(g) !== prefs.status) return false;
      if (prefs.category !== 'all' && g.category !== prefs.category) return false;
      if (q) {
        const episodeText = g.episodes.map((e) => e.title).join(' ');
        if (!fold(`${g.title} ${g.category} ${g.platform} ${g.description} ${episodeText}`).includes(q)) return false;
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
      el.empty.innerHTML = isEditing()
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

  // Bulut modunda üstteki çubukta kayıt durumu gösterilir.
  function renderSaveState() {
    if (mode !== 'cloud') return;
    let text = 'Buluta kaydedildi';
    let cls = '';
    if (pendingSaves > 0) { text = 'Kaydediliyor…'; cls = 'is-dirty'; }
    else if (saveFailed) { text = 'Son değişiklik kaydedilemedi'; cls = 'is-error'; }
    else if (!cloudLive()) { text = 'Kurulum tamamlanmadı'; cls = 'is-dirty'; }
    else if (!cloudInitialized()) { text = 'Liste henüz bulutta değil'; cls = 'is-dirty'; }
    el.dirtyPill.textContent = text;
    el.dirtyPill.className = `pill ${cls}`.trim();
  }

  // Sağ üstteki düğme: yerel modda "Düzenle"; bulut modunda sahibi giriş yapmadıysa "Giriş".
  function renderAuthButton() {
    const label = el.editToggle.querySelector('span');
    const use = el.editToggle.querySelector('use');
    if (mode === 'cloud' && !owner) {
      label.textContent = 'Giriş';
      use.setAttribute('href', '#i-lock');
      el.editToggle.setAttribute('aria-label', 'Yönetici girişi');
      el.editToggle.removeAttribute('aria-pressed');
    } else {
      label.textContent = 'Düzenle';
      use.setAttribute('href', '#i-edit');
      el.editToggle.setAttribute('aria-label', 'Düzenle');
      el.editToggle.setAttribute('aria-pressed', String(isEditing()));
    }
  }

  function renderEditing() {
    const editing = isEditing();
    document.body.classList.toggle('is-editing', editing);
    el.editBar.hidden = !editing;
    renderAuthButton();
    if (mode === 'cloud') {
      renderSaveState();
      el.publishBtn.querySelector('span').textContent = 'Yedekle';
      el.setupBtn.hidden = false;
      el.logoutBtn.hidden = false;
    } else {
      const dirty = isDirty();
      el.dirtyPill.textContent = dirty ? 'Yayınlanmamış değişiklik var' : 'Yayındakiyle aynı';
      el.dirtyPill.className = `pill${dirty ? ' is-dirty' : ''}`;
    }
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
    renderTabs();
    renderNowPlaying();
    renderSchedule();
    renderWheelButton();
    if (latest) renderLatest();
    if (suggestions) renderSuggestions();
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
    pendingGameHash = ''; // kullanıcı kendi kapattıysa, bekleyen link sonradan araya girmesin
    if (GAME_HASH.test(location.hash)) setHash(activeTab === 'suggestions' ? '#oneriler' : '');
  });

  /* ---------- oyunun linki ---------- */
  // Her oyunun kendi adresi var: …/#oyun/<kimlik> (ör. #oyun/elden-ring). Bu adresle açılan sayfa o oyunun
  // penceresini açar; pencere açıkken adres çubuğu da bu adresi gösterir, oradan da kopyalanabilir.
  const GAME_HASH = /^#oyun\/(.+)$/;
  const gameHash = (g) => `#oyun/${encodeURIComponent(g.id)}`;
  const gameUrl = (g) => `${location.href.split('#')[0]}${gameHash(g)}`;

  function setHash(hash) {
    try {
      history.replaceState(null, '', hash || location.pathname + location.search);
    } catch (err) { /* önizleme çerçevesinde adres değiştirilemeyebilir */ }
  }

  function gameFromHash(hash) {
    const m = GAME_HASH.exec(hash || '');
    if (!m) return null;
    let key = m[1];
    try { key = decodeURIComponent(key); } catch (err) { /* bozuk kodlama: olduğu gibi denenir */ }
    // elle yazılmış linkler için oyunun adıyla da aranır (#oyun/elden-ring, #oyun/Elden%20Ring)
    return findGame(key) || data.games.find((g) => slugify(g.title) === slugify(key)) || null;
  }

  // Bulut modunda liste sonradan gelir; oyun ilk listede yoksa liste gelince bir kez daha aranır (final).
  let pendingGameHash = '';
  function openFromHash(hash, final) {
    const g = gameFromHash(hash);
    if (g) {
      pendingGameHash = '';
      openDetail(g.id);
      return;
    }
    if (!final) {
      pendingGameHash = hash;
      return;
    }
    pendingGameHash = '';
    setHash(activeTab === 'suggestions' ? '#oneriler' : '');
    toast('Bu linkteki oyun listede bulunamadı.', { error: true });
  }

  window.addEventListener('hashchange', () => {
    if (GAME_HASH.test(location.hash)) openFromHash(location.hash, mode === 'local' || cloudFinal());
    else if (location.hash === '#cark') openWheel();
  });

  async function copyGameLink(g) {
    const url = gameUrl(g);
    try {
      await navigator.clipboard.writeText(url);
      toast('Oyunun linki kopyalandı. Video açıklamasına yapıştırabilirsin.');
    } catch (err) {
      window.prompt('Linki kopyala:', url);
    }
  }

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
  const openLabel = (e, n) => (isYoutubeUrl(e.url) ? `${episodeAcc(n)} YouTube'da aç` : `${episodeAcc(n)} yeni sekmede aç`);

  function playerHTML(g, ep) {
    const vid = youtubeId(ep.url);
    const start = youtubeStart(ep.url);
    return `<div class="cover"><iframe src="https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0${start ? `&start=${start}` : ''}" title="${esc(g.title)} · ${episodeName(episodeNo(g, ep))}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
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
      note = isEditing()
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
          ${link
            ? `<a class="ep-name ep-link" href="${esc(link)}" target="_blank" rel="noopener">${e.title ? esc(e.title) : episodeName(n)}</a>`
            : `<span class="ep-name">${e.title ? esc(e.title) : episodeName(n)}</span>`}
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
    const where = isYoutubeUrl(ep.url) ? "YouTube'da izle" : 'izle';
    const airedDated = airedEpisodes(g).filter((e) => e.date);
    const isNewest = ep === airedDated[airedDated.length - 1];
    const label = ongoing && isNewest ? `Son bölümü ${where}` : `${episodeAcc(n)} ${where}`;
    return `<a class="btn btn-yt" href="${esc(episodeLink(ep))}" target="_blank" rel="noopener">${icon('youtube')}<span>${label}</span></a>`;
  }

  let playingEpId = null;

  // Pencere yenilenirken (bulut güncellemesi, Steam bilgisi) odaklı düğme kaybolmasın diye sırası hatırlanır.
  const detailFocusables = () => $$('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])', el.detailContent);

  function openDetail(id, opts = {}) {
    const g = findGame(id);
    if (!g) return;
    pendingGameHash = ''; // başka bir oyun açıldıysa bekleyen link sonradan araya girmesin
    const keepPlayer = opts.keepPlayer && detailId === id;
    const focusIndex = keepPlayer && el.detailContent.contains(document.activeElement)
      ? detailFocusables().indexOf(document.activeElement) : -1;
    if (!keepPlayer) playingEpId = null;
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
    if (!isEditing()) actions.push(watchButtonHTML(g));
    if (isEditing()) {
      actions.push(`<button type="button" class="tick" data-detail="toggle" aria-pressed="${g.played}"><span class="tick-box">${icon('check')}</span>Oynadım</button>`);
      actions.push(`<button type="button" class="btn btn-ghost" data-detail="add-episode">${icon('plus')}<span>Bölüm ekle</span></button>`);
      actions.push(`<button type="button" class="btn btn-ghost" data-detail="cover">${icon('image')}<span>Kapak görseli</span></button>`);
      actions.push(`<button type="button" class="btn btn-ghost" data-detail="edit">${icon('edit')}<span>Düzenle</span></button>`);
    }
    const store = steamLink(g);
    if (store) {
      actions.push(`<a class="btn btn-ghost" href="${esc(store)}" target="_blank" rel="noopener">${icon('external')}<span>${isSteamUrl(store) ? "Steam'de gör" : 'Mağaza sayfası'}</span></a>`);
    }
    actions.push(`<button type="button" class="btn btn-ghost" data-detail="copy-link">${icon('copy')}<span>Linki kopyala</span></button>`);
    const actionsHTML = actions.filter(Boolean).join('');
    const oldPlayer = keepPlayer ? $('#detailPlayer', el.detailContent) : null;
    const scrollTop = keepPlayer ? el.detailDialog.scrollTop : 0;

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
        ${galleryEnabled() ? '<section class="gallery" id="gallerySection" aria-labelledby="galleryTitle" hidden></section>' : ''}
        ${actionsHTML ? `<div class="detail-actions">${actionsHTML}</div>` : ''}
      </div>`;
    // bulut güncellemesi gelince oynayan video kesilmesin
    if (oldPlayer && oldPlayer.querySelector('iframe')) {
      $('#detailPlayer', el.detailContent).replaceWith(oldPlayer);
      for (const row of $$('.ep', el.detailContent)) row.classList.toggle('is-playing', row.dataset.ep === playingEpId);
    }
    openDialog(el.detailDialog);
    if (location.hash !== gameHash(g)) setHash(gameHash(g));
    if (keepPlayer) el.detailDialog.scrollTop = scrollTop;
    if (focusIndex >= 0) {
      const target = detailFocusables()[focusIndex];
      if (target) target.focus({ preventScroll: true });
    }
    loadGallery(g.id, keepPlayer);
  }

  const refreshDetail = () => {
    if (detailId) openDetail(detailId, { keepPlayer: true });
  };

  function playEpisode(g, epId) {
    const ep = g.episodes.find((e) => e.id === epId);
    if (!ep || !hasVideo(ep)) return;
    $('#detailPlayer', el.detailContent).innerHTML = playerHTML(g, ep);
    playingEpId = epId;
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
    } else if (action === 'cover') {
      pickFile(quickCoverInput, g.id);
    } else if (action === 'gallery-add') {
      pickFile(galleryInput, g.id);
    } else if (action === 'gallery-open') {
      openLightbox(Number(btn.dataset.index) || 0);
    } else if (action === 'copy-link') {
      copyGameLink(g);
    }
  });

  /* ---------- görseller ---------- */
  const COVER_LIMITS = { maxSide: 720, maxChars: 380000 };   // kapak: oyun kaydının içinde durur
  const GALLERY_LIMITS = { maxSide: 1600, maxChars: 900000 }; // galeri: her görsel ayrı kayıt
  const quickCoverInput = $('#quickCoverInput');
  const galleryInput = $('#galleryInput');

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Görsel okunamadı'));
      img.src = src;
    });
  }

  function drawJpeg(img, maxSide, quality) {
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
    return canvas.toDataURL('image/jpeg', quality);
  }

  // Görseli küçültüp JPEG'e çevirir; sınırı aşarsa önce kaliteyi, sonra boyutu düşürür.
  // source: dosya (telefon galerisinden) ya da data:/blob: adresi
  async function imageToDataUrl(source, { maxSide, maxChars }) {
    let url = source;
    let revoke = false;
    if (typeof source !== 'string') {
      if (!source || !/^image\//.test(source.type)) throw new Error('Görsel dosyası değil');
      url = URL.createObjectURL(source);
      revoke = true;
    }
    try {
      const img = await loadImage(url);
      const tries = [[maxSide, 0.82], [maxSide, 0.7], [Math.round(maxSide * 0.75), 0.68], [Math.round(maxSide * 0.55), 0.62]];
      for (const [side, q] of tries) {
        const out = drawJpeg(img, side, q);
        if (out.length <= maxChars) return out;
      }
      throw new Error('Görsel çok büyük');
    } finally {
      if (revoke) URL.revokeObjectURL(url);
    }
  }

  function pickFile(input, gameId) {
    input.dataset.game = gameId;
    input.value = '';
    input.click();
  }

  quickCoverInput.addEventListener('change', async () => {
    const file = quickCoverInput.files && quickCoverInput.files[0];
    const g = findGame(quickCoverInput.dataset.game);
    if (!file || !g) return;
    try {
      g.cover = await imageToDataUrl(file, COVER_LIMITS);
      commit({ games: [g.id] });
      refreshDetail();
      toast('Kapak görseli güncellendi.');
    } catch (err) {
      toast('Bu dosya görsel olarak açılamadı. Telefonun galerisinden bir fotoğraf seç.', { error: true });
    }
  });

  /* galeri (yalnızca bulut modunda; görseller Firestore'da oyunun altında ayrı kayıtlar) */
  let gallery = { gameId: null, images: null, loading: false, error: false };
  const galleryEnabled = () => mode === 'cloud' && Boolean(cloudApi);

  async function loadGallery(gameId, keep) {
    if (!galleryEnabled()) return;
    if (keep && gallery.gameId === gameId && gallery.images) {
      renderGallery();
      return;
    }
    gallery = { gameId, images: null, loading: true, error: false };
    renderGallery();
    try {
      const images = await cloudApi.listImages(gameId);
      if (gallery.gameId !== gameId) return;
      gallery.images = Array.isArray(images) ? images : [];
    } catch (err) {
      if (gallery.gameId !== gameId) return;
      gallery.images = [];
      gallery.error = true;
    }
    gallery.loading = false;
    renderGallery();
  }

  function renderGallery() {
    const sec = $('#gallerySection', el.detailContent);
    if (!sec) return;
    const editing = isEditing();
    const imgs = gallery.images || [];
    if (!editing && !imgs.length) {
      sec.hidden = true;
      return;
    }
    let body;
    if (gallery.loading) body = '<p class="hint">Görseller yükleniyor…</p>';
    else if (gallery.error) body = '<p class="hint">Görseller şu an yüklenemedi.</p>';
    else if (!imgs.length) body = '<p class="hint">Henüz görsel yok. Oyundan ekran görüntüleri ya da fotoğraflar ekleyebilirsin.</p>';
    else {
      body = `<div class="gallery-grid">${imgs.map((im, i) => `<button type="button" class="gallery-item" data-detail="gallery-open" data-index="${i}" aria-label="Görseli büyüt (${i + 1}/${imgs.length})"><img src="${esc(safeImage(im.data))}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>`;
    }
    sec.innerHTML = `<div class="gallery-head">
        <h3 id="galleryTitle">Görseller ${imgs.length ? `<b>${imgs.length}</b>` : ''}</h3>
        ${editing ? `<button type="button" class="btn btn-ghost btn-sm" data-detail="gallery-add">${icon('plus')}<span>Görsel ekle</span></button>` : ''}
      </div>${body}`;
    sec.hidden = false;
  }

  galleryInput.addEventListener('change', async () => {
    const files = Array.from(galleryInput.files || []).slice(0, 10);
    const gameId = galleryInput.dataset.game;
    if (!files.length || !cloudApi || !findGame(gameId)) return;
    toast(files.length > 1 ? `${files.length} görsel yükleniyor…` : 'Görsel yükleniyor…');
    let added = 0;
    for (const file of files) {
      try {
        const dataUrl = await imageToDataUrl(file, GALLERY_LIMITS);
        const id = await track(cloudApi.addImage(gameId, dataUrl));
        if (gallery.gameId === gameId) {
          gallery.images = (gallery.images || []).concat({ id, data: dataUrl, createdAt: Date.now() });
          renderGallery();
        }
        added += 1;
      } catch (err) {
        if (err && !err.code) toast(`“${file.name}” görsel olarak açılamadı.`, { error: true });
      }
    }
    if (added) toast(added > 1 ? `${added} görsel eklendi.` : 'Görsel eklendi.');
  });

  /* görsel görüntüleyici */
  let lightboxIndex = 0;
  const lbDelete = $('#lightboxDelete');
  const lbCover = $('#lightboxCover');

  function openLightbox(index) {
    lightboxIndex = index;
    renderLightbox();
    openDialog(el.lightbox);
  }

  function renderLightbox() {
    const imgs = gallery.images || [];
    if (!imgs.length) {
      closeDialog(el.lightbox);
      return;
    }
    lightboxIndex = (lightboxIndex + imgs.length) % imgs.length;
    const im = imgs[lightboxIndex];
    $('#lightboxImg').src = safeImage(im.data);
    $('#lightboxCount').textContent = `${lightboxIndex + 1} / ${imgs.length}`;
    $('#lightboxPrev').hidden = imgs.length < 2;
    $('#lightboxNext').hidden = imgs.length < 2;
    const editing = isEditing();
    lbCover.hidden = !editing;
    lbDelete.hidden = !editing;
    delete lbDelete.dataset.confirm;
    lbDelete.querySelector('span').textContent = 'Sil';
  }

  $('#lightboxPrev').addEventListener('click', () => { lightboxIndex -= 1; renderLightbox(); });
  $('#lightboxNext').addEventListener('click', () => { lightboxIndex += 1; renderLightbox(); });
  el.lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { lightboxIndex -= 1; renderLightbox(); }
    if (e.key === 'ArrowRight') { lightboxIndex += 1; renderLightbox(); }
  });

  lbCover.addEventListener('click', async () => {
    const g = findGame(gallery.gameId);
    const im = (gallery.images || [])[lightboxIndex];
    if (!g || !im) return;
    try {
      g.cover = await imageToDataUrl(im.data, COVER_LIMITS);
      commit({ games: [g.id] });
      refreshDetail();
      toast('Bu görsel kapak yapıldı.');
    } catch (err) {
      toast('Kapak yapılamadı.', { error: true });
    }
  });

  // silme iki dokunuşla: önce "Emin misin?" sorulur
  lbDelete.addEventListener('click', async () => {
    const im = (gallery.images || [])[lightboxIndex];
    const gameId = gallery.gameId;
    if (!im || !cloudApi) return;
    if (lbDelete.dataset.confirm !== '1') {
      lbDelete.dataset.confirm = '1';
      lbDelete.querySelector('span').textContent = 'Emin misin? Tekrar bas';
      setTimeout(() => {
        if (lbDelete.dataset.confirm === '1') renderLightbox();
      }, 4000);
      return;
    }
    try {
      await track(cloudApi.deleteImage(gameId, im.id));
      gallery.images = (gallery.images || []).filter((x) => x.id !== im.id);
      renderGallery();
      renderLightbox();
      toast('Görsel silindi.');
    } catch (err) {
      renderLightbox();
    }
  });

  /* ---------- işlemler ---------- */
  function togglePlayed(id) {
    const g = findGame(id);
    if (!g) return;
    g.played = !g.played;
    g.playedAt = g.played ? todayISO() : null;
    justToggled = g.played ? g.id : null;
    commit({ games: [g.id] });
    if (g.played) toast(`“${g.title}” oynandı olarak işaretlendi.`);
  }

  function deleteGame(id) {
    const index = data.games.findIndex((g) => g.id === id);
    if (index < 0) return;
    const [removed] = data.games.splice(index, 1);
    if (mode === 'cloud' && cloudInitialized()) {
      scheduleCloudDelete([removed.id]);
      render();
    } else {
      commit({ deleted: [removed.id] });
    }
    toast(`“${removed.title}” silindi.`, {
      action: {
        label: 'Geri al',
        run: () => {
          if (mode === 'cloud' && pendingDeletes.has(removed.id)) {
            cancelCloudDelete([removed.id]);
            applyCloud();
            return;
          }
          if (findGame(removed.id)) return; // başka bir yoldan zaten geri gelmiş
          data.games.splice(Math.min(index, data.games.length), 0, removed);
          commit({ games: [removed.id] });
        }
      }
    });
  }

  function clearExampleGames() {
    const removed = data.games.map((g, index) => ({ g, index })).filter((x) => x.g.example);
    if (!removed.length) return;
    data.games = data.games.filter((g) => !g.example);
    const ids = removed.map((x) => x.g.id);
    if (mode === 'cloud' && cloudInitialized()) {
      scheduleCloudDelete(ids);
      render();
    } else {
      commit({ deleted: ids });
    }
    toast(`${removed.length} örnek oyun silindi.`, {
      action: {
        label: 'Geri al',
        // yalnızca silinen örnekler geri eklenir; arada eklenen ya da silinen oyunlara dokunulmaz
        run: () => {
          if (mode === 'cloud') {
            const waiting = ids.filter((id) => pendingDeletes.has(id));
            cancelCloudDelete(waiting);
            if (waiting.length === ids.length) {
              applyCloud();
              return;
            }
          }
          const restored = [];
          for (const { g, index } of removed) {
            if (!findGame(g.id)) {
              data.games.splice(Math.min(index, data.games.length), 0, g);
              restored.push(g.id);
            }
          }
          commit({ games: restored });
        }
      }
    });
  }

  function setEditing(on) {
    if (on && !canEdit()) {
      openLogin();
      return;
    }
    prefs.editing = on;
    savePrefs();
    render();
    if (on && mode === 'cloud') toast('Düzenleme modu açık. Her değişiklik otomatik kaydedilir ve herkes hemen görür.');
    else if (on) toast('Düzenleme modu açık. Değişiklikler bu tarayıcıda saklanır; herkese göstermek için “Yayınla”yı kullan.');
  }

  /* ---------- oyun formu ---------- */
  const f = {
    title: $('#f-title'),
    category: $('#f-category'),
    platform: $('#f-platform'),
    steam: $('#f-steam'),
    steamHint: $('#steamHint'),
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
        date: $('.ep-date-input', row).value,
        // yarım yazılmış ya da takvimde olmayan tarih: değer boş görünür ama alan dolu
        badDate: Boolean($('.ep-date-input', row).validity && $('.ep-date-input', row).validity.badInput)
      };
      const kept = row.dataset.existing === '1' || row.dataset.touched === '1';
      // linki, başlığı ve tarihi tamamen silinen satır da kaldırılmış sayılır
      r.counts = Boolean(r.url || r.title || (kept && (r.date || r.badDate)));
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
    const raw = urlInput.value.trim();
    const url = cleanEpisodeUrl(raw);
    if (!youtubeId(url) || titleInput.value.trim() || typeof fetch !== 'function') return;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
        controller ? { signal: controller.signal } : undefined);
      if (!res.ok) return;
      const info = await res.json();
      // kullanıcı bu arada yazdıysa ya da link değiştiyse dokunma
      if (info && info.title && !titleInput.value.trim() && urlInput.value.trim() === raw) {
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
    for (const id of ['f-title-error', 'f-category-error', 'f-steam-error', 'f-played-at-error']) $(`#${id}`).hidden = true;
    setValid(f.title);
    setValid(f.category);
    setValid(f.steam);
    f.steam.setAttribute('aria-describedby', 'steamHint');
    setValid(f.playedAt);
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
    f.steam.value = g ? g.steamUrl : '';
    updateSteamHint();
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
    picker.hidden = true;
    syncPickerButton();
    openDialog(el.formDialog);
    // odak hemen verilir; gecikmeli verilse kullanıcının o arada dokunduğu alandan odağı çalabilirdi
    focusTarget.focus();
    if (opts.addEpisode) focusTarget.scrollIntoView({ block: 'center' });
  }

  // yazmaya başlayınca o alanın hata mesajı kalksın
  for (const [input, errorId] of [[f.title, 'f-title-error'], [f.category, 'f-category-error'], [f.steam, 'f-steam-error'], [f.playedAt, 'f-played-at-error']]) {
    input.addEventListener('input', () => {
      setValid(input);
      $(`#${errorId}`).hidden = true;
      if (input === f.steam) input.setAttribute('aria-describedby', 'steamHint');
    });
  }
  f.steam.addEventListener('input', updateSteamHint);
  f.title.addEventListener('input', updateSteamHint);

  // Steam alanının altındaki açıklama: boşsa otomatik bulunan sayfa (ya da aranacağı), doluysa ne olacağı
  function updateSteamHint() {
    const typed = f.steam.value.trim();
    const e = formId ? steamMap[formId] : null;
    const sameTitle = e && e.title === f.title.value.trim();
    let text;
    if (STEAM_NONE.test(typed)) text = 'Bu oyunun penceresinde mağaza linki gösterilmez.';
    else if (typed) text = 'Oyunun penceresinde bu link gösterilir.';
    else if (sameTitle && e.appid) text = `Boş bırakırsan Steam'de bulunan sayfa kullanılır: ${e.name}. Yanlışsa doğru linki yapıştır; Steam'de yoksa “yok” yaz.`;
    else if (sameTitle) text = "Steam'de bu adla birebir eşleşen oyun bulunamadı. Linki kendin yapıştırabilirsin; Steam'de yoksa “yok” yaz.";
    else text = "Boş bırakırsan oyun adıyla Steam'de aranır; bulunursa bir saat içinde oyunun penceresine “Steam'de gör” eklenir. Steam'de yoksa “yok” yaz.";
    f.steamHint.textContent = text;
  }
  f.played.addEventListener('change', () => {
    if (!f.played.checked) {
      setValid(f.playedAt);
      $('#f-played-at-error').hidden = true;
    }
    syncPlayedAt();
  });
  f.title.addEventListener('input', updateCoverPreview);

  /* kanaldaki son videolardan bölüm seçme */
  const pickBtn = $('#pickFromChannel');
  const picker = $('#channelPicker');

  function syncPickerButton() {
    pickBtn.hidden = !(latest && latest.videos.length);
    if (pickBtn.hidden) picker.hidden = true;
    pickBtn.setAttribute('aria-expanded', String(!picker.hidden));
  }

  function renderPicker() {
    const used = new Set(readEpisodeRows().map((r) => youtubeId(r.url)).filter(Boolean));
    const items = (latest ? latest.videos : []).filter((v) => !used.has(v.id));
    if (!items.length) {
      picker.innerHTML = '<p class="hint">Kanaldaki son videoların hepsi bu oyunda zaten ekli.</p>';
      return;
    }
    picker.innerHTML = `<p class="hint">Dokunduğun video bu oyuna bölüm olarak eklenir; link, başlık ve yayın tarihi kendiliğinden dolar.</p>
      <ul class="pick-list">${items.map((v) => {
        const other = findEpisodeByVideo(v.id);
        const note = other && other.g.id !== formId ? ` · “${esc(other.g.title)}” oyununda ekli` : '';
        return `<li><button type="button" class="pick-video" data-pick="${esc(v.id)}">
          <span class="pick-thumb"><img src="${esc(v.thumbnail)}" alt="" loading="lazy"></span>
          <span class="pick-text"><span class="pick-title">${esc(v.title)}</span><span class="pick-meta">${esc(formatDate(localDay(v.published), 'short'))}${note}</span></span>
        </button></li>`;
      }).join('')}</ul>`;
  }

  pickBtn.addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    if (!picker.hidden) renderPicker();
    syncPickerButton();
  });

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick]');
    const v = btn && latest && latest.videos.find((x) => x.id === btn.dataset.pick);
    if (!v) return;
    const row = addEpisodeRow({ url: v.url, title: v.title, date: localDay(v.published) });
    row.dataset.touched = '1';
    updateCoverPreview();
    renderPicker();
    row.scrollIntoView({ block: 'nearest' });
  });

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
    // diğer satırların hataları yeni numaralarıyla görünmeye devam etsin
    for (const other of $$('.ep-row', f.episodes)) updateRowError(other);
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

  f.coverFile.addEventListener('change', async () => {
    const file = f.coverFile.files && f.coverFile.files[0];
    if (!file) return;
    try {
      formCover = await imageToDataUrl(file, COVER_LIMITS);
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
    // Steam alanı: boş, "yok" ya da tek parça bir link (şeması yazılmamışsa https:// eklenir)
    let steamUrl = f.steam.value.trim();
    if (STEAM_NONE.test(steamUrl)) {
      steamUrl = 'yok';
    } else if (steamUrl) {
      steamUrl = withScheme(steamUrl);
      if (safeLink(steamUrl)) {
        f.steam.value = steamUrl;
      } else {
        showError(f.steam, 'f-steam-error');
        firstInvalid = firstInvalid || f.steam;
      }
    }
    // yarım yazılmış bitirme tarihi sessizce başka bir tarihle değiştirilmesin
    if (f.played.checked && ((f.playedAt.validity && f.playedAt.validity.badInput) ||
        (f.playedAt.value && !isValidDay(f.playedAt.value)))) {
      showError(f.playedAt, 'f-played-at-error');
      firstInvalid = firstInvalid || f.playedAt;
    }
    // dokunulmamış boş satırlar yok sayılır (bkz. readEpisodeRows)
    const rows = readEpisodeRows().filter((r) => r.counts);
    for (const r of rows) {
      const urlInput = $('.ep-url', r.row);
      const dateInput = $('.ep-date-input', r.row);
      const errorId = $('.ep-row-error', r.row).id;
      // şemasız link ("youtube.com/watch?v=…"), YouTube'un embed kodu ya da linkli paylaşım metni
      // yapıştırılırsa içindeki video temiz bir izleme adresine çevrilir
      if (r.url && !safeLink(r.url)) {
        r.url = cleanEpisodeUrl(r.url);
        urlInput.value = r.url;
      }
      if (r.url && !safeLink(r.url)) {
        setInvalid(urlInput, errorId, 'Link https:// ile başlamalı.');
        firstInvalid = firstInvalid || urlInput;
      }
      if (r.badDate) {
        setInvalid(dateInput, errorId, 'Geçerli bir tarih seç (gün.ay.yıl).');
        firstInvalid = firstInvalid || dateInput;
      } else if (!r.date && r.row.dataset.undatedOk !== '1') {
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
      steamUrl,
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
      const game = normalizeGame({ ...values, id: newGameId(title), addedAt: new Date().toISOString() });
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
      formId = game.id;
    }
    closeDialog(el.formDialog);
    commit({ games: [formId] });
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
    for (const [input, id] of [[s.youtube, 's-youtube-error'], [s.github, 's-github-error']]) {
      $(`#${id}`).hidden = true;
      setValid(input);
    }
  }

  el.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearSettingsErrors();
    // "youtube.com/@kanal" gibi şemasız yazılan linkler tamamlanır
    s.youtube.value = withScheme(s.youtube.value);
    s.github.value = withScheme(s.github.value);
    const youtube = s.youtube.value.trim();
    const github = s.github.value.trim();
    let invalid = null;
    for (const [input, value, id] of [[s.youtube, youtube, 's-youtube-error'], [s.github, github, 's-github-error']]) {
      if (value && !safeLink(value)) {
        setInvalid(input, id);
        $(`#${id}`).hidden = false;
        invalid = invalid || input;
      }
    }
    if (invalid) {
      invalid.focus();
      return;
    }
    data.site = {
      channelName: s.channel.value.trim() || SITE_DEFAULTS.channelName,
      title: s.title.value.trim() || SITE_DEFAULTS.title,
      tagline: s.tagline.value.trim(),
      youtubeUrl: youtube,
      githubEditUrl: github
    };
    closeDialog(el.settingsDialog);
    commit({ site: true });
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
    if (mode === 'cloud') {
      const status = $('#dataStatus');
      status.classList.remove('is-dirty');
      status.textContent = `Değişikliklerin otomatik olarak buluta kaydediliyor (${data.games.length} oyun). Ayrıca GitHub'daki backup klasörüne her saat yedek alınıyor ve eski hâlleri saklanıyor.`;
      $('#publishBlock').hidden = true;
      $('#resetLocal').hidden = true;
      $('#downloadBackup').hidden = false;
      $('#restoreTitle').textContent = 'Yedek al ya da geri yükle';
      return;
    }
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

  // Bulut modunda elle yedek: site ayarları ve oyunlar tek bir JSON dosyasında (galeri görselleri hariç;
  // onlar GitHub'daki saatlik yedekte).
  $('#downloadBackup').addEventListener('click', () => {
    const payload = { version: Date.now(), site: data.site, games: data.games };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oyun-arsivi-yedek-${todayISO()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Yedek indirildi.');
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
    commit({ all: true });
    renderDataDialog();
    toast(message, {
      action: {
        label: 'Geri al',
        run: () => {
          data = previous;
          commit({ all: true });
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

  /* ---------- şimdi oynuyorum ---------- */
  // Devam eden oyunlardan son bölümü en yeni olan vitrine çıkar; öteki devam edenler altta kısa
  // düğmeler olarak listelenir. Bölümlerinin hiçbirinde tarih olmayan oyunlar sona kalır.
  function nowPlayingGames() {
    return data.games
      .filter((g) => gameState(g) === 'ongoing')
      .sort((a, b) => seriesInfo(b).last.localeCompare(seriesInfo(a).last)
        || String(b.addedAt).localeCompare(String(a.addedAt))
        || a.title.localeCompare(b.title, 'tr'));
  }

  // Yayınlanmış en yeni bölüm: tarihi olanların en yenisi, hiçbirinde tarih yoksa listedeki sonuncusu
  function newestAired(g) {
    const info = seriesInfo(g);
    return info.dated[info.dated.length - 1] || info.aired[info.aired.length - 1] || null;
  }

  // Vitrin üç parçadan oluşur: kapak (ya da oynayan video), bilgiler ve öteki devam edenler. Her parça
  // yalnızca içeriği değişince yeniden yazılır; oynayan video, aynı bölüm gösterildikçe yerinden hiç oynamaz
  // (iframe sayfadan çıkarılıp geri konursa baştan yüklenir).
  const nowParts = { media: '', info: '', more: '' };
  let nowPlaying = ''; // vitrinde oynayan video: "oyun|bölüm|video" (boş: oynamıyor)

  function setNowPart(node, part, html) {
    if (nowParts[part] === html) return;
    node.innerHTML = html;
    nowParts[part] = html;
  }

  // Vitrindeki videoyu durdurup yerine kapağı koyar (sayfada başka bir video başlarken).
  function stopNowPlaying() {
    if (!nowPlaying) return;
    nowPlaying = '';
    nowParts.media = '';
    renderNowPlaying();
  }

  function renderNowPlaying() {
    const [g, ...others] = nowPlayingGames();
    const ep = g && newestAired(g);
    if (!ep) {
      el.nowSection.hidden = true;
      setNowPart(el.nowPlayer, 'media', '');
      setNowPart(el.nowInfo, 'info', '');
      setNowPart(el.nowMore, 'more', '');
      nowPlaying = '';
      return;
    }
    const info = seriesInfo(g);
    const n = episodeNo(g, ep);
    const link = episodeLink(ep);
    const vid = youtubeId(ep.url);
    const first = info.aired.length === 1;
    const badge = `<span class="cover-video${link ? '' : ' is-soon'}">${link ? icon('play') : ''}${episodeName(n)}</span>`;

    let media;
    if (vid && canEmbed) {
      media = `<button type="button" class="cover" data-now="play" data-game="${esc(g.id)}" data-ep="${esc(ep.id)}" aria-label="${esc(g.title)}: ${episodeAcc(n)} oynat">${coverHTML(g)}<span class="play-big">${icon('play')}</span>${badge}</button>`;
    } else if (link) {
      media = `<a class="cover" href="${esc(link)}" target="_blank" rel="noopener" aria-label="${esc(g.title)}: ${openLabel(ep, n)}">${coverHTML(g)}<span class="play-big">${icon('play')}</span>${badge}</a>`;
    } else {
      media = `<button type="button" class="cover" data-now-game="${esc(g.id)}" aria-label="${esc(g.title)}: ayrıntılar">${coverHTML(g)}${badge}</button>`;
    }

    const when = [relativeDay(ep.date), formatDate(ep.date)].filter(Boolean).join(' · ');
    const tags = [g.category, g.platform].filter(Boolean).map(esc).join(' · ');
    const span = daysBetween(info.first, info.last);
    const meta = [`${info.aired.length} bölüm`];
    if (span > 0) meta.push(`${span} günde`);
    const next = info.upcoming[0];

    let watch;
    if (link) {
      const where = isYoutubeUrl(ep.url) ? "YouTube'da izle" : 'izle';
      watch = `<a class="btn btn-yt" href="${esc(link)}" target="_blank" rel="noopener">${icon('youtube')}<span>${first ? episodeAcc(n) : 'Son bölümü'} ${where}</span></a>`;
    } else {
      watch = watchButtonHTML(g); // en yeni bölümün linki yoksa linki olan bir bölüme gider
    }

    const infoHTML = `<div class="now-tags">
        ${tags ? `<span>${tags}</span>` : ''}
        ${g.example ? '<span class="example-chip" title="Örnek olarak eklendi">Örnek</span>' : ''}
      </div>
      <h3 class="now-title"><button type="button" class="now-title-btn" data-now-game="${esc(g.id)}">${esc(g.title)}</button></h3>
      <div class="now-ep">
        <span class="now-label">${first ? 'İlk bölüm' : 'Son bölüm'} · ${episodeName(n)}</span>
        ${ep.title ? `<span class="now-ep-title">${esc(ep.title)}</span>` : ''}
        ${when ? `<time class="now-ep-when" datetime="${esc(ep.date)}">${esc(when)}</time>` : ''}
      </div>
      <p class="now-meta">${meta.join(' · ')}${next ? ` · <span class="now-next">Sıradaki bölüm ${esc(formatDate(next.date))}</span>` : ''}</p>
      <div class="now-actions">
        ${watch}
        <button type="button" class="btn btn-ghost" data-now-game="${esc(g.id)}">${icon('pad')}<span>Tüm bölümler</span></button>
      </div>`;
    const moreHTML = others.length
      ? `<span>${others.length === 1 ? 'Bu da devam ediyor:' : 'Bunlar da devam ediyor:'}</span>${others.map((o) =>
        `<button type="button" class="latest-game" data-now-game="${esc(o.id)}">${icon('pad')}<span>${esc(o.title)}</span></button>`).join('')}`
      : '';

    // oynayan bölüm vitrinden düştüyse ya da videosu değiştiyse yerine kapak gelir
    if (nowPlaying && nowPlaying !== `${g.id}|${ep.id}|${vid}`) {
      nowPlaying = '';
      nowParts.media = '';
    }
    if (!nowPlaying) setNowPart(el.nowPlayer, 'media', media);
    setNowPart(el.nowInfo, 'info', infoHTML);
    setNowPart(el.nowMore, 'more', moreHTML);
    el.nowMore.hidden = !others.length;
    el.nowSection.hidden = false;
  }

  el.nowBody.addEventListener('click', (e) => {
    const play = e.target.closest('[data-now="play"]');
    if (play) {
      // ekranda görünen bölüm oynatılır (o arada gün dönüp vitrin değişmiş olsa bile)
      const g = findGame(play.dataset.game);
      const ep = g && g.episodes.find((x) => x.id === play.dataset.ep);
      if (!ep || !hasVideo(ep)) {
        renderNowPlaying();
        return;
      }
      stopLatestPlayer();
      el.nowPlayer.innerHTML = playerHTML(g, ep);
      nowPlaying = `${g.id}|${ep.id}|${youtubeId(ep.url)}`;
      return;
    }
    const game = e.target.closest('[data-now-game]');
    if (game) openDetail(game.dataset.nowGame);
  });

  /* ---------- yakında (yayın takvimi) ---------- */
  // Tüm oyunların ileri tarihli bölümleri tarihe göre sıralanır (aynı gün olanlar oyun adına ve bölüm
  // sırasına göre). İlk SCHED_LIMIT tanesi gösterilir; fazlası "Tümünü göster" ile açılır.
  const SCHED_LIMIT = 4;
  let schedExpanded = false;
  let schedHTML = '';

  function upcomingEpisodes() {
    const list = [];
    for (const g of data.games) {
      g.episodes.forEach((e, i) => {
        if (isUpcoming(e)) list.push({ g, e, n: i + 1 });
      });
    }
    return list.sort((a, b) => a.e.date.localeCompare(b.e.date) || a.g.title.localeCompare(b.g.title, 'tr') || a.n - b.n);
  }

  function renderSchedule() {
    const list = upcomingEpisodes();
    if (!list.length) {
      el.schedSection.hidden = true;
      el.schedList.innerHTML = '';
      schedHTML = '';
      schedExpanded = false;
      return;
    }
    const shown = schedExpanded ? list : list.slice(0, SCHED_LIMIT);
    const html = shown.map(({ g, e, n }) => {
      const d = parseDay(e.date);
      const day = d.toLocaleDateString('tr-TR', { day: 'numeric' });
      const month = d.toLocaleDateString('tr-TR', { month: 'short' });
      const weekday = d.toLocaleDateString('tr-TR', { weekday: 'short' });
      const link = episodeLink(e);
      const where = isYoutubeUrl(e.url) ? "YouTube'da aç" : 'yeni sekmede aç';
      return `<li class="sched-item">
        <time class="sched-date" datetime="${esc(e.date)}" title="${esc(formatDate(e.date))}">
          <b>${esc(day)}</b><span>${esc(month)}</span><small>${esc(weekday)}</small>
        </time>
        <div class="sched-main">
          <span class="sched-when">${esc(relativeDay(e.date))}</span>
          <button type="button" class="sched-game" data-sched-game="${esc(g.id)}">${esc(g.title)}</button>
          <span class="sched-ep">${episodeName(n)}${e.title ? ` · ${esc(e.title)}` : ''}</span>
        </div>
        ${link ? `<a class="ep-ext sched-link" href="${esc(link)}" target="_blank" rel="noopener" aria-label="${esc(g.title)}: ${episodeAcc(n)} ${where}">${icon('external')}</a>` : ''}
      </li>`;
    }).join('');
    if (html !== schedHTML) {
      el.schedList.innerHTML = html;
      schedHTML = html;
    }
    el.schedCount.textContent = `${list.length} bölüm`;
    const extra = list.length - SCHED_LIMIT;
    el.schedToggle.hidden = extra <= 0;
    if (extra > 0) {
      el.schedToggle.textContent = schedExpanded ? 'Daha az göster' : `Tümünü göster (${extra} bölüm daha)`;
      el.schedToggle.setAttribute('aria-expanded', String(schedExpanded));
    } else {
      schedExpanded = false;
    }
    el.schedSection.hidden = false;
  }

  el.schedList.addEventListener('click', (e) => {
    const game = e.target.closest('[data-sched-game]');
    if (game) openDetail(game.dataset.schedGame);
  });
  el.schedToggle.addEventListener('click', () => {
    schedExpanded = !schedExpanded;
    renderSchedule();
  });

  // Gün dönünce (sayfa açık kalmışsa) yarınki bölümler yayınlanmış sayılır: tarihe bağlı her şey yenilenir.
  // Video oynayan bölümler (vitrin, son video, açık oyun penceresi) o sırada atlanır; iframe yeniden
  // çizilirse video baştan başlar ya da durur. Onlar bir sonraki çizimde güncellenir.
  let renderedDay = todayISO();
  setInterval(() => {
    if (todayISO() === renderedDay) return;
    renderedDay = todayISO();
    renderSite();
    renderStats();
    renderFilters();
    renderGrid();
    renderSchedule();
    if (!nowPlaying) renderNowPlaying();
    if (latest && !$('#latestPlayer iframe', el.latestBody)) renderLatest();
    if (el.detailDialog.open && findGame(detailId) && !$('#detailPlayer iframe', el.detailContent)) refreshDetail();
  }, 60000);

  /* ---------- Steam sayfası ---------- */
  // data/steam.json'u saatlik görev yazar (scripts/sync.mjs): oyunlar adıyla Steam'de aranır, yalnızca adı
  // birebir tutan kabul edilir. Formdaki "Steam sayfası" doluysa o kullanılır; "yok" yazılırsa link gösterilmez.
  let steamMap = {};
  const STEAM_NONE = /^yok$/i;

  function isSteamUrl(url) {
    try { return /(^|\.)steampowered\.com$/i.test(new URL(url).hostname); } catch (err) { return false; }
  }

  function steamLink(g) {
    const manual = String(g.steamUrl || '').trim();
    if (manual) return STEAM_NONE.test(manual) ? '' : safeLink(manual);
    const e = steamMap[g.id];
    // ad değiştiyse eski eşleşme kullanılmaz; görev yeni adla yeniden arar
    return e && e.title === g.title && Number.isInteger(e.appid) && e.appid > 0 ? `https://store.steampowered.com/app/${e.appid}/` : '';
  }

  async function loadSteam() {
    const gh = CONFIG.github || {};
    const bucket = Math.floor(Date.now() / 600000); // en fazla 10 dakikalık önbellek
    const sources = [];
    if (gh.repo && /^https?:$/.test(location.protocol)) {
      sources.push(`https://raw.githubusercontent.com/${gh.repo}/${gh.branch || 'main'}/data/steam.json?v=${bucket}`);
    }
    sources.push(`data/steam.json?v=${bucket}`);
    for (const url of sources) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) continue;
        const json = await res.json();
        if (!json || typeof json.games !== 'object' || Array.isArray(json.games)) continue;
        const open = el.detailDialog.open ? findGame(detailId) : null;
        const before = open ? steamLink(open) : '';
        steamMap = json.games;
        // açık pencere yalnızca düğmesi değiştiyse yenilenir (oynayan video varsa baştan başlamasın diye dokunulmaz)
        if (open && steamLink(open) !== before && !$('#detailPlayer iframe', el.detailContent)) refreshDetail();
        if (el.formDialog.open) updateSteamHint();
        return;
      } catch (err) {
        /* bir sonraki kaynağı dene */
      }
    }
  }

  /* ---------- sıradaki ne olsun? çarkı ---------- */
  // Bekleyen ("Sırada") oyunlardan biri rastgele seçilir; istenirse devam edenler de çarka katılır ve oyunlar
  // tek tek çıkarılabilir. Kazanan önce rastgele (crypto) seçilir, animasyon yalnızca onu gösterir.
  // Hangi grupların çarkta olduğu ve ses tercihi bu tarayıcıda saklanır; çıkarılan oyunlar sayfa açıkken hatırlanır.
  const wh = {
    open: $('#wheelBtn'),
    dialog: $('#wheelDialog'),
    stage: $('#wheelStage'),
    rotor: $('#wheelRotor'),
    ticker: $('#wheelTicker'),
    result: $('#wheelResult'),
    spin: $('#wheelSpin'),
    chips: $('#wheelChips'),
    count: $('#wheelCount'),
    sound: $('#wheelSound')
  };
  const wheelExcluded = new Set();
  let wheelAngle = 0;     // çarkın dönüşü (derece, saat yönünde)
  let wheelRaf = 0;       // dönerken animasyon karesi; 0: durgun
  let wheelWinner = null; // son kazananın kimliği
  let wheelDrawn = '';    // çizili dilimlerin anahtarı; değişmediyse yeniden çizilmez
  let wheelChipsHTML = '';
  let angleIds = '';      // çarkın şu anki açısının ait olduğu dilim listesi (kazanan okun altında kalsın diye)

  const wheelPool = () => data.games
    .filter((g) => prefs.wheelPools.includes(gameState(g)))
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  const wheelCandidates = () => wheelPool().filter((g) => !wheelExcluded.has(g.id));
  const idsOf = (list) => list.map((g) => g.id).join('|');

  // 0 ≤ sonuç < n, eşit olasılıkla (crypto varsa onunla, yoksa Math.random)
  function randomInt(n) {
    const c = window.crypto;
    if (c && c.getRandomValues) {
      const limit = Math.floor(0x100000000 / n) * n;
      const buf = new Uint32Array(1);
      do c.getRandomValues(buf); while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  // Çarktaki oyun yoksa düğme gizlenir (hepsi oynandıysa ya da liste boşsa).
  function renderWheelButton() {
    wh.open.hidden = !data.games.some((g) => gameState(g) !== 'played');
    if (wh.dialog.open) renderWheel();
  }

  // Dilimin üst ucu tepedeki oka göre saat yönünde açı (derece); nokta: merkezden r uzaklıkta
  const wheelPoint = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return `${(r * Math.sin(a)).toFixed(3)} ${(-r * Math.cos(a)).toFixed(3)}`;
  };
  const slicePath = (i, s, r) => `M0 0 L${wheelPoint(i * s, r)} A${r} ${r} 0 ${s > 180 ? 1 : 0} 1 ${wheelPoint((i + 1) * s, r)} Z`;
  // Okun altındaki dilim: çark r derece dönmüşse okun gösterdiği yer çarkın -r açısıdır
  const sliceAt = (angle, n) => Math.floor(((((-angle) % 360) + 360) % 360) / (360 / n)) % n;

  // Dilim yazıları dıştan içe uzanır; göbeğe değmesin diye ölçülüp sığana kadar kısaltılır.
  function fitWheelLabels() {
    for (const t of $$('.wheel-label', wh.rotor)) {
      const full = t.dataset.full || '';
      let len = full.length;
      t.textContent = full;
      while (len > 1 && t.getComputedTextLength() > 74) {
        len--;
        t.textContent = `${full.slice(0, len).trimEnd()}…`;
      }
    }
  }

  function renderWheel() {
    const pool = wheelPool();
    const list = pool.filter((g) => !wheelExcluded.has(g.id));
    const spinning = Boolean(wheelRaf);
    for (const btn of $$('[data-pool]', wh.dialog)) {
      const key = btn.dataset.pool;
      btn.setAttribute('aria-pressed', String(prefs.wheelPools.includes(key)));
      btn.disabled = spinning;
      $('b', btn).textContent = data.games.filter((g) => gameState(g) === key).length;
    }
    wh.sound.setAttribute('aria-pressed', String(prefs.wheelSound));
    $('use', wh.sound).setAttribute('href', prefs.wheelSound ? '#i-sound-on' : '#i-sound-off');
    wh.count.textContent = pool.length ? `${list.length} / ${pool.length}` : '0';
    // etiketler yalnızca değişince yeniden yazılır; odaklı etiket yeniden yazılınca odak yerinde kalır
    const chipsHTML = pool.map((g) => `<button type="button" class="chip-filter" data-wheel-game="${esc(g.id)}" aria-pressed="${!wheelExcluded.has(g.id)}"${spinning ? ' disabled' : ''}>${esc(g.title)}</button>`).join('');
    if (chipsHTML !== wheelChipsHTML) {
      const focused = wh.chips.contains(document.activeElement) ? document.activeElement.dataset.wheelGame : null;
      wh.chips.innerHTML = chipsHTML;
      wheelChipsHTML = chipsHTML;
      if (focused) {
        const again = $$('[data-wheel-game]', wh.chips).find((b) => b.dataset.wheelGame === focused);
        if (again) again.focus({ preventScroll: true });
      }
    }
    // dönerken düğme odağını kaybetmesin diye kapatılmaz, yalnızca "meşgul" gösterilir
    wh.spin.disabled = !list.length && !spinning;
    wh.spin.setAttribute('aria-disabled', String(spinning));
    if (spinning) return; // dönerken dilimler değişmez; bitince güncel listeyle çizilir

    let note = '';
    if (wheelWinner) {
      const idx = list.findIndex((g) => g.id === wheelWinner);
      if (idx < 0) {
        // liste değişti ve kazanan artık çarkta değil (silindi, oynandı ya da çıkarıldı)
        wheelWinner = null;
        note = '<p class="wheel-note">Liste güncellendi ve son kazanan artık çarkta değil. Tekrar çevir.</p>';
      } else if (idsOf(list) !== angleIds) {
        // dilimler değiştiyse çark, kazananın yeni dilimi okun altına gelecek şekilde ayarlanır
        const s = 360 / list.length;
        wheelAngle = (360 - (idx * s + s / 2)) % 360;
        angleIds = idsOf(list);
      }
    }
    wh.spin.textContent = wheelWinner ? 'Tekrar çevir' : 'Çevir';

    const key = JSON.stringify([list.map((g) => [g.id, g.title]), wheelWinner, wheelAngle]);
    if (key !== wheelDrawn) {
      wheelDrawn = key;
      if (!list.length) {
        wh.rotor.innerHTML = '<circle class="wheel-empty" r="100"/><text class="wheel-empty-text" text-anchor="middle" y="-30">Çarkta oyun yok</text>';
        wh.ticker.textContent = '';
        if (!wheelWinner && !note) {
          note = `<p class="wheel-note">${pool.length ? 'Bütün oyunları çarktan çıkardın; aşağıdaki listeden geri ekle.' : 'Seçili grupta oyun yok. Yukarıdan bir grup seç.'}</p>`;
        }
      } else {
        if (!wheelWinner && !note) wh.result.innerHTML = '';
        const n = list.length;
        const s = 360 / n;
        const size = n <= 6 ? 9 : n <= 12 ? 7.5 : n <= 20 ? 6 : n <= 32 ? 4.6 : 0;
        let win = '';
        wh.rotor.innerHTML = list.map((g, i) => {
          const fill = `hsl(${hashHue(g.title)} 62% ${i % 2 ? 36 : 45}%)`;
          const shape = n === 1
            ? `<circle class="wheel-slice" r="100" style="fill:${fill}"/>`
            : `<path class="wheel-slice" d="${slicePath(i, s, 100)}" style="fill:${fill}"/>`;
          // kazananın çerçevesi en sonda ve biraz içeride çizilir; komşular ve kenar onu örtmesin
          if (g.id === wheelWinner) win = n === 1 ? '<circle class="wheel-win-ring" r="96"/>' : `<path class="wheel-win-ring" d="${slicePath(i, s, 96)}"/>`;
          if (!size) return shape;
          const mid = i * s + s / 2;
          return `${shape}<text class="wheel-label" transform="rotate(${(mid - 90).toFixed(3)})" x="92" dy=".35em" text-anchor="end" font-size="${size}" data-full="${esc(g.title)}">${esc(g.title)}</text>`;
        }).join('') + win;
        wh.rotor.setAttribute('transform', `rotate(${wheelAngle.toFixed(3)})`);
        if (wh.dialog.open) fitWheelLabels();
        if (!wheelWinner) wh.ticker.textContent = `${n} oyun çarkta`;
      }
    }
    if (note) wh.result.innerHTML = note;
  }

  /* ses: kısa "tık"lar ve kazanınca üç notalık bir arpej (Web Audio; desteklenmezse sessiz) */
  let audio = null;
  let lastTick = 0;
  // Ses bağlamı kullanıcının dokunuşuyla (Çevir'e basınca) kurulur ve uyandırılır; iPhone'da başka türlü sessiz kalır.
  function wakeAudio() {
    if (!prefs.wheelSound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio = audio || new Ctx();
      if (audio.state !== 'running') audio.resume().catch(() => {});
    } catch (err) { /* ses yoksa sessiz devam */ }
  }
  function beep(freq, dur, gain = 0.05, when = 0) {
    if (!prefs.wheelSound || !audio) return;
    try {
      const t = audio.currentTime + when;
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      vol.gain.setValueAtTime(gain, t);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(vol).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (err) { /* ses çalınamazsa sessiz devam */ }
  }
  function tick(now) {
    if (now - lastTick < 40) return; // çok hızlı dönerken tıklar birbirine karışmasın
    lastTick = now;
    beep(1500, 0.03, 0.035);
  }

  // Konfeti ekranın tamamını kaplayan sabit bir katmanda uçar; pencerede kaydırma çubuğu oluşturmaz.
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = wh.stage.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 36; i++) {
      const p = document.createElement('span');
      p.className = 'confetti';
      const a = (i / 36) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 120 + Math.random() * 160;
      p.style.left = `${Math.round(r.left + r.width / 2)}px`;
      p.style.top = `${Math.round(r.top + r.height / 2)}px`;
      p.style.setProperty('--x', `${Math.round(Math.cos(a) * dist)}px`);
      p.style.setProperty('--y', `${Math.round(Math.sin(a) * dist)}px`);
      p.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
      p.style.setProperty('--h', String(Math.round(Math.random() * 360)));
      layer.append(p);
    }
    wh.dialog.append(layer);
    setTimeout(() => layer.remove(), 1500);
  }

  function stopWheel() {
    if (wheelRaf) cancelAnimationFrame(wheelRaf);
    wheelRaf = 0;
    wh.dialog.classList.remove('is-spinning');
  }

  function spinWheel() {
    if (wheelRaf) return;
    wakeAudio();
    wheelWinner = null;
    wheelDrawn = '';
    renderWheel();
    const list = wheelCandidates();
    if (!list.length) return;
    const n = list.length;
    const s = 360 / n;
    const win = randomInt(n);
    const spunIds = idsOf(list);
    // kazananın dilimi içinde rastgele bir nokta (kenarlara çok yakın olmasın) okun altına gelir
    const target = (360 - (win * s + s * (0.15 + Math.random() * 0.7))) % 360;
    const from = wheelAngle;
    const delta = ((target - (((from % 360) + 360) % 360)) + 360) % 360;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = (reduce ? 0 : 360 * (5 + randomInt(3))) + delta;
    const duration = reduce ? 500 : 5200 + randomInt(1400);
    const t0 = performance.now();
    let shown = -1;
    wh.result.innerHTML = '';
    wh.dialog.classList.add('is-spinning');
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      wheelAngle = from + total * (1 - Math.pow(1 - t, 4)); // yavaşlayarak durur
      wh.rotor.setAttribute('transform', `rotate(${wheelAngle.toFixed(3)})`);
      const idx = sliceAt(wheelAngle, n);
      if (idx !== shown) {
        shown = idx;
        wh.ticker.textContent = list[idx].title;
        if (t < 1) tick(now);
      }
      if (t < 1) {
        wheelRaf = requestAnimationFrame(frame);
        return;
      }
      stopWheel();
      finishSpin(list[win].id, spunIds);
    };
    wheelRaf = requestAnimationFrame(frame);
    renderWheel(); // grupları ve etiketleri "meşgul" göster
  }

  function finishSpin(id, spunIds) {
    wheelAngle %= 360;
    angleIds = spunIds;
    // dönerken liste değiştiyse kazanan yeniden aranır; artık çarkta değilse ilan edilmez
    const g = wheelCandidates().find((x) => x.id === id);
    if (!g) {
      wheelWinner = null;
      wheelDrawn = '';
      renderWheel();
      wh.result.innerHTML = '<p class="wheel-note">Çark dönerken liste güncellendi ve gelen oyun artık çarkta değil. Tekrar çevir.</p>';
      if (!wh.dialog.contains(document.activeElement)) wh.spin.focus({ preventScroll: true });
      return;
    }
    wheelWinner = g.id;
    const state = { todo: 'Sırada', ongoing: 'Devam ediyor', played: 'Oynandı' }[gameState(g)];
    const meta = [g.category, g.platform, state].filter(Boolean).map(esc).join(' · ');
    const others = wheelCandidates().length > 1;
    wh.result.innerHTML = `<div class="wheel-win">
        <span class="eyebrow">Sıradaki oyun</span>
        <h3>${esc(g.title)}</h3>
        <span class="wheel-win-meta">${meta}</span>
        <div class="wheel-win-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-wheel="open">${icon('pad')}<span>Oyunu aç</span></button>
          ${others ? `<button type="button" class="btn btn-ghost btn-sm" data-wheel="drop">${icon('x')}<span>Çarktan çıkar, tekrar çevir</span></button>` : ''}
        </div>
      </div>`;
    wh.ticker.textContent = ''; // kazanan aşağıdaki kartta büyük yazıyor
    renderWheel();
    if (!wh.dialog.contains(document.activeElement)) wh.spin.focus({ preventScroll: true });
    beep(660, 0.14, 0.06);
    beep(880, 0.14, 0.06, 0.12);
    beep(1320, 0.3, 0.06, 0.24);
    confetti();
  }

  function openWheel() {
    const fresh = !wh.dialog.open;
    if (fresh) {
      wheelWinner = null;
      wheelDrawn = '';
      wh.ticker.textContent = '';
      // seçili gruplarda hiç oyun yoksa (ör. "Sırada" oyun kalmadıysa) oyunu olan gruplar seçilir
      if (!wheelPool().length) {
        const filled = ['todo', 'ongoing'].filter((k) => data.games.some((g) => gameState(g) === k));
        if (filled.length) {
          prefs.wheelPools = filled;
          savePrefs();
        }
      }
    }
    openDialog(wh.dialog);
    renderWheel(); // pencere açıkken çizilir; dilim yazıları ancak görünürken ölçülebilir
    if (location.hash !== '#cark') setHash('#cark');
    if (fresh) wh.spin.focus({ preventScroll: true });
  }

  wh.open.addEventListener('click', openWheel);
  wh.spin.addEventListener('click', spinWheel);
  wh.sound.addEventListener('click', () => {
    prefs.wheelSound = !prefs.wheelSound;
    savePrefs();
    wakeAudio();
    renderWheel();
  });
  wh.dialog.addEventListener('click', (e) => {
    if (e.target === wh.dialog || e.target.closest('[data-close]')) {
      closeDialog(wh.dialog);
      return;
    }
    if (wheelRaf) return;
    const pool = e.target.closest('[data-pool]');
    if (pool) {
      const key = pool.dataset.pool;
      prefs.wheelPools = prefs.wheelPools.includes(key) ? prefs.wheelPools.filter((p) => p !== key) : [...prefs.wheelPools, key];
      savePrefs();
      wheelWinner = null;
      renderWheel();
      return;
    }
    const chip = e.target.closest('[data-wheel-game]');
    if (chip) {
      const id = chip.dataset.wheelGame;
      if (wheelExcluded.has(id)) wheelExcluded.delete(id);
      else wheelExcluded.add(id);
      wheelWinner = null;
      renderWheel();
      return;
    }
    const act = e.target.closest('[data-wheel]');
    if (!act || !wheelWinner) return;
    if (act.dataset.wheel === 'open') {
      const id = wheelWinner;
      closeDialog(wh.dialog);
      openDetail(id);
    } else if (act.dataset.wheel === 'drop') {
      wheelExcluded.add(wheelWinner);
      wh.spin.focus({ preventScroll: true }); // basılan düğme birazdan kaldırılacak; odak çevir düğmesine geçer
      spinWheel();
    }
  });
  wh.dialog.addEventListener('close', () => {
    stopWheel();
    renderWheel();
    for (const layer of $$('.confetti-layer', wh.dialog)) layer.remove();
    if (el.toasts.parentElement === wh.dialog) document.body.append(el.toasts);
    if (location.hash === '#cark') setHash(activeTab === 'suggestions' ? '#oneriler' : '');
  });

  /* ---------- kanaldaki son video ---------- */
  // data/latest.json'u GitHub'daki otomatik görev her saat günceller (scripts/sync.mjs).
  let latest = null;
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

  function findEpisodeByVideo(vid) {
    for (const g of data.games) {
      const i = g.episodes.findIndex((e) => youtubeId(e.url) === vid);
      if (i >= 0) return { g, n: i + 1 };
    }
    return null;
  }

  async function loadLatest() {
    const gh = CONFIG.github || {};
    const bucket = Math.floor(Date.now() / 600000); // en fazla 10 dakikalık önbellek
    const sources = [];
    if (gh.repo && /^https?:$/.test(location.protocol)) {
      sources.push(`https://raw.githubusercontent.com/${gh.repo}/${gh.branch || 'main'}/data/latest.json?v=${bucket}`);
    }
    sources.push(`data/latest.json?v=${bucket}`);
    for (const url of sources) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) continue;
        const json = await res.json();
        const videos = (json && Array.isArray(json.videos) ? json.videos : [])
          .filter((v) => v && VIDEO_ID.test(String(v.id)) && v.title)
          .slice(0, 15)
          .map((v) => ({
            id: v.id,
            title: String(v.title),
            published: String(v.published || ''),
            url: `https://www.youtube.com/watch?v=${v.id}`,
            thumbnail: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
          }));
        if (!videos.length) continue;
        latest = { channelUrl: safeLink(json.channelUrl), videos };
        renderLatest();
        syncPickerButton();
        return;
      } catch (err) {
        /* bir sonraki kaynağı dene */
      }
    }
  }

  const latestMoreHTML = (list) => (list.length ? `<ol class="latest-more">${list.slice(0, 4).map((r) => `<li><a class="latest-mini" href="${esc(r.url)}" target="_blank" rel="noopener">
          <span class="latest-mini-thumb"><img src="${esc(r.thumbnail)}" alt="" loading="lazy"></span>
          <span class="latest-mini-title">${esc(r.title)}</span>
          <span class="latest-mini-when">${esc(relativeDay(localDay(r.published)))}</span>
        </a></li>`).join('')}</ol>` : '');

  function renderLatest() {
    if (!latest) {
      el.latestSection.hidden = true;
      return;
    }
    const [v, ...rest] = latest.videos;
    // Kanaldaki son video "Şimdi oynuyorum" vitrinindeki bölümse ikinci kez büyük gösterilmez;
    // bu bölümde yalnızca öteki videolar listelenir.
    const featured = nowPlayingGames()[0];
    const featuredEp = featured && newestAired(featured);
    if (featuredEp && youtubeId(featuredEp.url) === v.id) {
      el.latestTitle.textContent = 'Kanaldaki diğer videolar';
      el.latestBody.innerHTML = latestMoreHTML(rest);
    } else {
      el.latestTitle.textContent = 'Kanaldaki son video';
      const day = localDay(v.published);
      const when = [relativeDay(day), formatDate(day)].filter(Boolean).join(' · ');
      const match = findEpisodeByVideo(v.id);
      const thumb = `<img src="${esc(v.thumbnail)}" alt="" decoding="async">`;
      const media = canEmbed
        ? `<button type="button" class="cover" data-latest-play="${esc(v.id)}" aria-label="Videoyu oynat: ${esc(v.title)}">${thumb}<span class="play-big">${icon('play')}</span></button>`
        : `<a class="cover" href="${esc(v.url)}" target="_blank" rel="noopener" aria-label="Videoyu YouTube'da aç: ${esc(v.title)}">${thumb}<span class="play-big">${icon('play')}</span></a>`;
      const playing = $('#latestPlayer iframe', el.latestBody);
      el.latestBody.innerHTML = `<article class="latest-main">
          <div class="latest-media" id="latestPlayer">${media}</div>
          <div class="latest-info">
            <p class="latest-when">${esc(when)}</p>
            <h3 class="latest-title"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a></h3>
            ${match ? `<button type="button" class="latest-game" data-latest-game="${esc(match.g.id)}">${icon('pad')}<span>${esc(match.g.title)} · ${episodeName(match.n)}</span></button>` : ''}
            <div class="latest-actions"><a class="btn btn-yt btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('youtube')}<span>YouTube'da izle</span></a></div>
          </div>
        </article>
        ${latestMoreHTML(rest)}`;
      if (playing) $('#latestPlayer', el.latestBody).replaceChildren(playing.parentElement);
    }
    const channel = safeLink(data.site.youtubeUrl) || latest.channelUrl;
    el.latestChannel.hidden = !channel;
    if (channel) el.latestChannel.href = channel;
    el.latestSection.hidden = !el.latestBody.innerHTML.trim();
  }

  // Bu bölümde oynayan videoyu durdurup yerine kapağı koyar (vitrinde video başlarken).
  function stopLatestPlayer() {
    const frame = $('#latestPlayer iframe', el.latestBody);
    if (!frame) return;
    frame.parentElement.remove();
    renderLatest();
  }

  el.latestBody.addEventListener('click', (e) => {
    const play = e.target.closest('[data-latest-play]');
    if (play) {
      const id = play.dataset.latestPlay;
      if (!VIDEO_ID.test(id)) return;
      stopNowPlaying();
      $('#latestPlayer', el.latestBody).innerHTML = `<div class="cover"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="Kanaldaki son video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
      return;
    }
    const game = e.target.closest('[data-latest-game]');
    if (game) openDetail(game.dataset.latestGame);
  });

  /* ---------- sekmeler ve öneriler ---------- */
  // Öneriler ziyaretçilerin yazabildiği bir veritabanı gerektirdiği için yalnızca bulut modunda var.
  let suggestions = null;
  let sugError = false;
  let unsubSug = null;
  let activeTab = 'games';
  const VOTES_KEY = 'oyunArsivi.oylar.v1';
  const LAST_SUG_KEY = 'oyunArsivi.sonOneri.v1';
  const myVotes = new Set(Array.isArray(storageGet(VOTES_KEY)) ? storageGet(VOTES_KEY) : []);
  // Sekmeler yalnızca veritabanına gerçekten ulaşılabildiğinde görünür; kurulum bitmeden ziyaretçiler
  // çalışmayan bir öneri formu görmesin.
  const suggestionsAvailable = () => mode === 'cloud' && cloudLive();
  let wantSuggestionsTab = false; // adres #oneriler ile açıldıysa bağlantı kurulunca o sekmeye geç
  const sg = {
    form: $('#sugForm'),
    title: $('#sg-title'),
    category: $('#sg-category'),
    note: $('#sg-note'),
    name: $('#sg-name'),
    dup: $('#sg-dup'),
    titleError: $('#sg-title-error'),
    error: $('#sg-error'),
    submit: $('#sg-submit')
  };

  function subscribeSuggestions() {
    if (!cloudApi) return;
    if (unsubSug) unsubSug();
    unsubSug = cloudApi.watchSuggestions((list) => {
      suggestions = Array.isArray(list) ? list : [];
      sugError = false;
      renderSuggestions();
      renderTabs();
    }, () => {
      sugError = true;
      if (suggestions === null) suggestions = [];
      renderSuggestions();
    });
  }

  function renderTabs() {
    const show = suggestionsAvailable();
    el.tabs.hidden = !show;
    if (!show) {
      el.gamesPanel.hidden = false;
      el.sugPanel.hidden = true;
      return;
    }
    if (wantSuggestionsTab) {
      wantSuggestionsTab = false;
      activeTab = 'suggestions';
    }
    $('#tabGamesCount').textContent = data.games.length;
    const open = (suggestions || []).filter((x) => x.status !== 'added' && x.status !== 'rejected').length;
    $('#tabSugCount').textContent = open || '';
    for (const t of $$('.tab', el.tabs)) {
      const on = t.dataset.tab === activeTab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    el.gamesPanel.hidden = activeTab !== 'games';
    el.sugPanel.hidden = activeTab !== 'suggestions';
  }

  function setTab(tab) {
    if (tab === 'suggestions' && !suggestionsAvailable()) {
      wantSuggestionsTab = mode === 'cloud';
      return;
    }
    activeTab = tab === 'suggestions' ? 'suggestions' : 'games';
    renderTabs();
    if (activeTab === 'suggestions') renderSuggestions();
    try {
      history.replaceState(null, '', activeTab === 'suggestions' ? '#oneriler' : location.pathname + location.search);
    } catch (err) { /* önizleme çerçevesinde adres değiştirilemeyebilir */ }
  }

  el.tabs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) setTab(t.dataset.tab);
  });
  el.tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    setTab(activeTab === 'games' ? 'suggestions' : 'games');
    $(`[data-tab="${activeTab}"]`, el.tabs).focus();
  });

  function sortedSuggestions() {
    const rank = (x) => (x.status === 'added' ? 1 : x.status === 'rejected' ? 2 : 0);
    return (suggestions || [])
      .filter((x) => x.status !== 'rejected' || isEditing())
      .slice()
      .sort((a, b) => rank(a) - rank(b) || (b.votes || 0) - (a.votes || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  }

  const gameByTitle = (title) => data.games.find((g) => fold(g.title) === fold(title));

  function suggestionHTML(x) {
    const voted = myVotes.has(x.id);
    const added = x.status === 'added';
    const inList = (x.gameId && findGame(x.gameId)) || gameByTitle(x.title);
    const when = x.createdAt ? relativeDay(localDay(x.createdAt)) : 'az önce';
    let actions = '';
    if (isEditing()) {
      if (!added && inList) actions += `<button type="button" class="btn btn-ghost btn-sm" data-sug="mark">${icon('check')}<span>Listede var, işaretle</span></button>`;
      else if (!added) actions += `<button type="button" class="btn btn-primary btn-sm" data-sug="add">${icon('plus')}<span>Listeme ekle</span></button>`;
      actions += `<button type="button" class="btn btn-danger btn-sm" data-sug="delete">${icon('trash')}<span>Sil</span></button>`;
    }
    return `<li class="sug${added ? ' is-added' : ''}" data-id="${esc(x.id)}">
      <button type="button" class="vote-btn" data-sug="vote" aria-pressed="${voted}" ${voted || added ? 'disabled' : ''} aria-label="${voted ? 'Oy verdin' : 'Ben de istiyorum'}: ${esc(x.title)}, ${x.votes || 0} oy">${icon('up')}<b>${x.votes || 0}</b></button>
      <div class="sug-main">
        <div class="sug-title-row">
          <h3>${esc(x.title)}</h3>
          ${x.category ? `<span class="chip chip-static">${esc(x.category)}</span>` : ''}
          ${added ? `<span class="status is-played">${icon('check')}Listeye eklendi</span>` : ''}
        </div>
        ${x.note ? `<p class="sug-note">${esc(x.note)}</p>` : ''}
        <p class="sug-meta">${esc(x.name || 'Anonim')} · ${esc(when)}</p>
        ${actions ? `<div class="sug-actions">${actions}</div>` : ''}
      </div>
    </li>`;
  }

  function renderSuggestions() {
    if (!suggestionsAvailable()) return;
    const list = sortedSuggestions();
    $('#sugList').innerHTML = list.map(suggestionHTML).join('');
    const empty = $('#sugEmpty');
    let msg = '';
    if (suggestions === null) msg = cloudApi || !cloudError ? 'Öneriler yükleniyor…' : 'Öneriler şu an yüklenemiyor.';
    else if (sugError && !list.length) msg = 'Öneriler şu an gösterilemiyor.';
    else if (!list.length) msg = 'Henüz öneri yok. İlk öneriyi sen yap!';
    empty.textContent = msg;
    empty.hidden = !msg;
    $('#sugCountLine').textContent = list.length ? `${list.length} öneri` : '';
    sg.submit.disabled = !cloudApi;
  }

  function updateDupHint() {
    const t = sg.title.value.trim();
    let msg = '';
    if (t && gameByTitle(t)) msg = 'Bu oyun zaten listede; Oyunlar sekmesinde bulabilirsin.';
    else if (t && (suggestions || []).some((x) => fold(x.title) === fold(t))) msg = 'Bu oyun daha önce önerilmiş; aşağıda “Ben de istiyorum” diyerek destekleyebilirsin.';
    sg.dup.textContent = msg;
    sg.dup.hidden = !msg;
  }
  sg.title.addEventListener('input', () => {
    sg.titleError.hidden = true;
    setValid(sg.title);
    updateDupHint();
  });

  sg.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    sg.error.hidden = true;
    const title = sg.title.value.trim();
    if (!title) {
      showError(sg.title, 'sg-title-error');
      sg.title.focus();
      return;
    }
    const showSugError = (text) => {
      sg.error.textContent = text;
      sg.error.hidden = false;
    };
    if (!cloudApi) return showSugError('Şu an bağlantı kurulamıyor. Biraz sonra tekrar dene.');
    if (gameByTitle(title)) return showSugError('Bu oyun zaten listede.');
    const prev = (suggestions || []).find((x) => fold(x.title) === fold(title));
    if (prev) return showSugError('Bu oyun zaten önerilmiş. Listede “Ben de istiyorum”a basarak destekleyebilirsin.');
    const last = Number(storageGet(LAST_SUG_KEY)) || 0;
    if (Date.now() - last < 30000) return showSugError('Az önce bir öneri gönderdin. Biraz bekleyip tekrar dene.');
    const sent = { title, category: sg.category.value.trim(), note: sg.note.value.trim(), name: sg.name.value.trim() };
    // form hemen temizlenir: onay beklerken yeni bir öneri yazmaya başlayan kişinin yazdıkları silinmesin
    sg.form.reset();
    updateDupHint();
    storageSet(LAST_SUG_KEY, Date.now());
    sg.submit.disabled = true;
    try {
      await cloudApi.addSuggestion(sent);
      toast('Önerin gönderildi. Teşekkürler!');
    } catch (err) {
      storageRemove(LAST_SUG_KEY);
      // gönderilemediyse, kişi bu arada başka bir şey yazmadıysa yazdıkları geri gelir
      if (!sg.title.value && !sg.note.value) {
        sg.title.value = sent.title;
        sg.category.value = sent.category;
        sg.note.value = sent.note;
        sg.name.value = sent.name;
      }
      showSugError('Öneri gönderilemedi. İnternet bağlantını kontrol edip tekrar dene.');
    } finally {
      sg.submit.disabled = !cloudApi;
    }
  });

  async function voteSuggestion(id) {
    const x = (suggestions || []).find((y) => y.id === id);
    if (!x || myVotes.has(id) || !cloudApi) return;
    myVotes.add(id);
    storageSet(VOTES_KEY, Array.from(myVotes));
    x.votes = (x.votes || 0) + 1;
    renderSuggestions();
    try {
      await cloudApi.voteSuggestion(id);
    } catch (err) {
      myVotes.delete(id);
      storageSet(VOTES_KEY, Array.from(myVotes));
      x.votes = Math.max(0, (x.votes || 1) - 1);
      renderSuggestions();
      toast('Oy verilemedi. Tekrar dene.', { error: true });
    }
  }

  function addSuggestionToList(id) {
    const x = (suggestions || []).find((y) => y.id === id);
    if (!x || !cloudApi) return;
    const existing = (x.gameId && findGame(x.gameId)) || gameByTitle(x.title);
    if (existing) {
      quiet(track(cloudApi.markSuggestion(id, { status: 'added', gameId: existing.id })));
      toast(`“${existing.title}” zaten listende; öneri “eklendi” olarak işaretlendi.`);
      return;
    }
    const game = normalizeGame({ id: newGameId(x.title), title: x.title, category: x.category || 'Diğer', addedAt: new Date().toISOString() });
    data.games.push(game);
    commit({ games: [game.id] });
    quiet(track(cloudApi.markSuggestion(id, { status: 'added', gameId: game.id })));
    toast(`“${game.title}” listene eklendi.`, { action: { label: 'Düzenle', run: () => openForm(game.id) } });
  }

  $('#sugList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sug]');
    if (!btn) return;
    const id = btn.closest('.sug').dataset.id;
    const action = btn.dataset.sug;
    if (action === 'vote') voteSuggestion(id);
    else if (action === 'add') addSuggestionToList(id);
    else if (action === 'mark') addSuggestionToList(id);
    else if (action === 'delete') {
      if (btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1';
        btn.querySelector('span').textContent = 'Emin misin?';
        setTimeout(() => {
          if (btn.isConnected && btn.dataset.confirm === '1') {
            delete btn.dataset.confirm;
            btn.querySelector('span').textContent = 'Sil';
          }
        }, 4000);
        return;
      }
      quiet(track(cloudApi.deleteSuggestion(id)));
    }
  });

  // açılışta yapılan ek işler (son video, #oneriler adresi)
  function initExtras(startHash) {
    if (startHash === '#oneriler') setTab('suggestions');
    loadLatest();
    loadSteam();
  }

  /* ---------- bulut bağlantısı ---------- */
  let unsubGames = null;
  let unsubSite = null;
  let setupShownOnce = false;

  // Firestore'dan gelen veriyi sayfaya uygular. Bulut henüz boşsa (kurulum bitmemiş) ziyaretçiler
  // data/games.js'teki listeyi görmeye devam eder.
  function applyCloud() {
    if (mode !== 'cloud') return;
    if (cloudLive() && cloudInitialized()) {
      const games = cloudGames.filter((g) => !pendingDeletes.has(g.id)).map((g, i) => normalizeGame(g, i));
      const site = normalizeData({ site: cloudSite || published.site }).site;
      data = { version: 0, baseVersion: 0, site, games };
    } else {
      // bulut boşken sahibinin bu tarayıcıdaki düzenlemeleri de (varsa) aktarılmak üzere korunur
      data = loadData();
    }
    render();
    if (el.detailDialog.open && detailId) {
      if (findGame(detailId)) refreshDetail();
      // tarayıcıdaki eski kopyada olmayan oyun, sunucudan güncel liste gelene kadar kapatılmaz
      else if (!gamesFromCache) closeDialog(el.detailDialog);
    }
    if (el.setupDialog.open) renderSetup();
    // #oyun/… linkiyle açıldıysa ve oyun ilk listede yoksa her yeni listede yeniden aranır; "bulunamadı"
    // kararı yalnızca sunucudan gelen listeyle (ya da hata olunca) verilir
    if (pendingGameHash && (cloudGames !== null || cloudError)) openFromHash(pendingGameHash, cloudFinal());
  }

  const cloudFinal = () => (cloudGames !== null && !gamesFromCache) || Boolean(cloudError);

  function subscribeCloud() {
    if (!cloudApi) return;
    if (unsubGames) unsubGames();
    if (unsubSite) unsubSite();
    cloudError = null;
    unsubGames = cloudApi.watchGames((games, meta) => {
      cloudGames = Array.isArray(games) ? games : [];
      gamesFromCache = Boolean(meta && meta.fromCache);
      cloudError = null;
      applyCloud();
      maybeShowSetup();
    }, (err) => {
      cloudError = { code: (err && err.code) || 'unknown', message: String((err && err.message) || err) };
      cloudGames = null;
      applyCloud();
      maybeShowSetup();
    });
    unsubSite = cloudApi.watchSite((site) => {
      cloudSite = site || null;
      applyCloud();
      maybeShowSetup();
    }, () => {});
    if (typeof subscribeSuggestions === 'function') subscribeSuggestions();
  }

  // Sahibi giriş yaptığında kurulumda eksik adım varsa yardımcı bir kez kendiliğinden açılır.
  function maybeShowSetup() {
    if (!owner || setupShownOnce) return;
    if (cloudGames === null && !cloudError) return; // ilk yanıt bekleniyor
    if (cloudSite === undefined && !cloudError) return; // liste boşsa karar site ayarlarına kalır; onları da bekle
    if (cloudLive() && cloudInitialized()) return;
    setupShownOnce = true;
    openSetup();
  }

  function onCloudReady() {
    const api = window.cloud;
    if (mode !== 'cloud') return;
    if (!api || !api.enabled) {
      cloudError = { code: 'sdk', message: (api && api.error) || 'Firebase yüklenemedi' };
      renderEditing();
      if (pendingGameHash) openFromHash(pendingGameHash, true);
      return;
    }
    if (cloudApi) return;
    cloudApi = api;
    cloudApi.onAuthChange((user) => {
      owner = user;
      if (!owner && prefs.editing) prefs.editing = false;
      render();
      if (owner && location.hash === '#kurulum') openSetup();
      maybeShowSetup();
      if (el.setupDialog.open) renderSetup();
    });
    subscribeCloud();
    renderEditing();
  }
  window.addEventListener('cloud-ready', onCloudReady);

  /* ---------- giriş ---------- */
  const loginForm = $('#loginForm');
  const loginError = $('#l-error');

  function authErrorText(err) {
    const code = (err && err.code) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(code)) return 'E-posta ya da şifre yanlış.';
    if (/too-many-requests/.test(code)) return 'Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar dene.';
    if (/network/.test(code)) return 'İnternet bağlantısı yok gibi görünüyor.';
    if (/user-disabled/.test(code)) return 'Bu hesap devre dışı bırakılmış.';
    return `Giriş yapılamadı (${code || 'bilinmeyen hata'}).`;
  }

  function openLogin() {
    if (mode !== 'cloud') {
      openSetup();
      return;
    }
    loginError.hidden = true;
    openDialog(el.loginDialog);
    if (!cloudApi) {
      loginError.textContent = cloudError && cloudError.code === 'sdk'
        ? 'Firebase\'e bağlanılamadı. İnternet bağlantını kontrol edip sayfayı yenile.'
        : 'Bağlantı kuruluyor, birkaç saniye sonra tekrar dene.';
      loginError.hidden = false;
    }
    $('#l-email').focus();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const email = $('#l-email').value.trim();
    const password = $('#l-pass').value;
    if (!email || !password) {
      loginError.textContent = 'E-posta ve şifreyi yaz.';
      loginError.hidden = false;
      return;
    }
    if (!cloudApi) {
      openLogin();
      return;
    }
    const btn = $('#l-submit');
    btn.disabled = true;
    try {
      await cloudApi.signIn(email, password);
      $('#l-pass').value = '';
      closeDialog(el.loginDialog);
      prefs.editing = true;
      savePrefs();
      render();
      toast('Giriş yapıldı. Düzenleme modu açık; her değişiklik otomatik kaydedilir.');
    } catch (err) {
      loginError.textContent = authErrorText(err);
      loginError.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $('#l-forgot').addEventListener('click', async () => {
    const email = $('#l-email').value.trim();
    if (!email) {
      loginError.textContent = 'Önce e-posta adresini yaz, sonra “Şifremi unuttum”a bas.';
      loginError.hidden = false;
      $('#l-email').focus();
      return;
    }
    if (!cloudApi) return;
    try {
      await cloudApi.resetPassword(email);
      loginError.hidden = true;
      toast('Şifre sıfırlama e-postası gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.');
    } catch (err) {
      loginError.textContent = authErrorText(err);
      loginError.hidden = false;
    }
  });

  async function logout() {
    if (!cloudApi) return;
    try {
      await cloudApi.signOut();
      prefs.editing = false;
      savePrefs();
      render();
      toast('Çıkış yapıldı.');
    } catch (err) {
      toast('Çıkış yapılamadı. Tekrar dene.', { error: true });
    }
  }

  /* ---------- kurulum yardımcısı ---------- */
  const KURULUM_URL = CONFIG.github && CONFIG.github.repo
    ? `https://github.com/${CONFIG.github.repo}/blob/${CONFIG.github.branch || 'main'}/KURULUM.md`
    : 'KURULUM.md';

  function setupStep(done, title, body) {
    return `<li class="setup-step${done ? ' is-done' : ''}">
      <span class="setup-mark" aria-hidden="true">${done ? icon('check') : ''}</span>
      <div class="setup-main"><h3>${title}${done ? '<span class="visually-hidden"> (tamam)</span>' : ''}</h3>${done ? '' : body}</div>
    </li>`;
  }

  function renderSetup() {
    const parts = [];
    const projectId = cloudApi && cloudApi.projectId;
    const consoleUrl = projectId ? `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}` : 'https://console.firebase.google.com/';
    const connected = mode === 'cloud' && Boolean(cloudApi);
    parts.push(setupStep(connected, 'Firebase bağlantısı', mode === 'cloud'
      ? '<p>Firebase yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.</p>'
      : `<p>Site henüz buluta bağlı değil. <a href="${esc(KURULUM_URL)}" target="_blank" rel="noopener">KURULUM.md</a> rehberindeki adımları izle; Firebase ayarlarını Claude'a gönder ya da <code>js/config.js</code> dosyasına yapıştır.</p>`));
    parts.push(setupStep(Boolean(owner), 'Yönetici girişi', connected
      ? '<p>Firebase\'de oluşturduğun e-posta ve şifreyle giriş yap.</p><button type="button" class="btn btn-primary btn-sm" data-setup="login">Giriş yap</button>'
      : '<p>Önce bağlantı kurulmalı.</p>'));
    const missingDb = cloudError && /not-found|failed-precondition/.test(cloudError.code);
    const denied = cloudError && cloudError.code === 'permission-denied';
    const rulesOk = cloudLive();
    let rulesBody = '<p>Giriş yapınca burada sana özel güvenlik kuralları görünecek.</p>';
    if (owner && cloudApi) {
      if (missingDb) {
        rulesBody = `<p>Firestore veritabanı henüz oluşturulmamış. Firebase'de <b>Firestore Database → Create database</b> adımını tamamla.</p>
          <div class="setup-actions"><a class="btn btn-ghost btn-sm" href="${esc(consoleUrl)}/firestore" target="_blank" rel="noopener">Firestore'u aç</a>
          <button type="button" class="btn btn-ghost btn-sm" data-setup="retry">Tekrar kontrol et</button></div>`;
      } else {
        const rules = cloudApi.rulesFor(owner.email);
        rulesBody = `<p>${denied ? 'Veritabanı şu an kimsenin okumasına izin vermiyor. ' : ''}Aşağıdaki kuralları kopyala; Firebase'de <b>Firestore Database → Rules</b> sekmesindeki her şeyi silip yapıştır ve <b>Publish</b>'e bas. Kurallar oyunları herkese gösterir ama yalnızca senin (${esc(owner.email)}) değiştirmene izin verir.</p>
          <textarea class="export-text" id="setupRules" rows="8" readonly aria-label="Güvenlik kuralları">${esc(rules)}</textarea>
          <div class="setup-actions"><button type="button" class="btn btn-primary btn-sm" data-setup="copy-rules">${icon('copy')}<span>Kuralları kopyala</span></button>
          <a class="btn btn-ghost btn-sm" href="${esc(consoleUrl)}/firestore/rules" target="_blank" rel="noopener">Kurallar sayfasını aç</a>
          <button type="button" class="btn btn-ghost btn-sm" data-setup="retry">Yayınladım, kontrol et</button></div>`;
      }
    }
    parts.push(setupStep(rulesOk, 'Güvenlik kuralları', rulesBody));
    const count = loadData().games.length;
    parts.push(setupStep(rulesOk && cloudInitialized(), 'Listeyi buluta aktar', rulesOk && owner
      ? `<p>Şu anki liste (${count} oyun) ve site ayarları buluta yüklenir. Sonra her değişiklik otomatik kaydedilir.</p><button type="button" class="btn btn-primary btn-sm" data-setup="migrate">Listeyi buluta aktar</button>`
      : '<p>Önceki adımlar bitince açılır.</p>'));
    const ytDone = Boolean(safeLink(data.site.youtubeUrl));
    parts.push(setupStep(ytDone, 'YouTube kanal linki', owner && rulesOk
      ? '<p>Kanal linkini girince “Abone ol” düğmesi ve kanaldaki son video (en geç bir saat içinde) görünür.</p><button type="button" class="btn btn-ghost btn-sm" data-setup="settings">Site ayarlarını aç</button>'
      : '<p>Giriş yapınca “Site ayarları”ndan eklenir.</p>'));
    const allDone = connected && owner && rulesOk && cloudInitialized() && ytDone;
    el.setupBody.innerHTML = `
      ${allDone ? '<p class="data-status">Kurulum tamam. Değişikliklerin otomatik kaydediliyor ve herkes hemen görüyor.</p>' : ''}
      <ol class="setup-steps">${parts.join('')}</ol>
      <p class="hint">Ayrıntılı rehber: <a href="${esc(KURULUM_URL)}" target="_blank" rel="noopener">KURULUM.md</a></p>`;
  }

  function openSetup() {
    renderSetup();
    openDialog(el.setupDialog);
  }

  el.setupBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-setup]');
    if (!btn) return;
    const action = btn.dataset.setup;
    if (action === 'login') {
      closeDialog(el.setupDialog);
      openLogin();
    } else if (action === 'retry') {
      subscribeCloud();
      toast('Kontrol ediliyor…');
    } else if (action === 'settings') {
      closeDialog(el.setupDialog);
      openSettings();
    } else if (action === 'copy-rules') {
      const ta = $('#setupRules');
      try {
        await navigator.clipboard.writeText(ta.value);
        toast('Kurallar kopyalandı. Firebase\'de Rules sekmesine yapıştır ve Publish\'e bas.');
      } catch (err) {
        ta.focus();
        ta.select();
        toast('Otomatik kopyalanamadı. Metin seçili; uzun basıp “Kopyala”yı seç.');
      }
    } else if (action === 'migrate') {
      btn.disabled = true;
      const local = loadData();
      data = local;
      try {
        await track(cloudApi.replaceGames(local.games));
        await track(cloudApi.saveSite(local.site));
        toast(`${local.games.length} oyun buluta aktarıldı. Artık her değişiklik otomatik kaydedilir.`);
      } catch (err) {
        btn.disabled = false;
      }
      renderSetup();
    }
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
    if (t && t.tagName === 'IMG' && t.closest('.cover, .latest-mini-thumb, .pick-thumb')) t.remove();
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

  el.editToggle.addEventListener('click', () => {
    if (mode === 'cloud' && !owner) openLogin();
    else setEditing(!isEditing());
  });
  el.setupBtn.addEventListener('click', openSetup);
  el.logoutBtn.addEventListener('click', logout);
  $('#editDone').addEventListener('click', () => setEditing(false));
  $('#addBtn').addEventListener('click', () => openForm(null));
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#publishBtn').addEventListener('click', openDataDialog);
  el.clearExamples.addEventListener('click', clearExampleGames);

  // Adres sonu: #duzenle düzenleme modunu (bulut modunda girişi), #kurulum kurulum yardımcısını,
  // #oneriler öneriler sekmesini açar.
  const startHash = location.hash;
  if (startHash === '#duzenle' && mode === 'local') prefs.editing = true;

  document.documentElement.lang = 'tr';
  applyTheme();
  render();
  if (startHash === '#kurulum') openSetup();
  else if (startHash === '#cark') openWheel();
  else if ((startHash === '#duzenle' || startHash === '#giris') && mode === 'cloud') openLogin();
  else if (GAME_HASH.test(startHash)) openFromHash(startHash, mode === 'local');
  if (typeof initExtras === 'function') initExtras(startHash);
  // cloud.js bir modül olduğu için bu dosyadan sonra çalışır; yine de olay kaçtıysa yakala
  if (window.cloud) onCloudReady();
})();
