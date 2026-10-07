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

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
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
  function normalizeGame(g) {
    g = g && typeof g === 'object' ? g : {};
    const played = Boolean(g.played);
    return {
      id: String(g.id || uid()),
      title: String(g.title || '').trim() || 'İsimsiz oyun',
      category: String(g.category || '').trim() || 'Diğer',
      platform: String(g.platform || '').trim(),
      description: String(g.description || '').trim(),
      cover: String(g.cover || '').trim(),
      video: String(g.video || '').trim(),
      rating: Math.max(0, Math.min(5, Math.round(Number(g.rating) || 0))),
      played,
      playedAt: played && g.playedAt ? String(g.playedAt) : null,
      addedAt: String(g.addedAt || new Date().toISOString())
    };
  }

  function normalizeData(d) {
    d = d && typeof d === 'object' ? d : {};
    const site = { ...SITE_DEFAULTS };
    if (d.site && typeof d.site === 'object') {
      for (const k of Object.keys(SITE_DEFAULTS)) if (d.site[k] != null) site[k] = String(d.site[k]);
    }
    return {
      version: Number(d.version) || 0,
      site,
      games: Array.isArray(d.games) ? d.games.map(normalizeGame) : []
    };
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
    statPlayed: $('#statPlayed'),
    statTodo: $('#statTodo'),
    statCats: $('#statCats'),
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
    const vid = youtubeId(g.video);
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
    return g.played
      ? `<span class="status is-played">${icon('check')}Oynandı</span>`
      : '<span class="status">Sırada</span>';
  }

  function cardHTML(g) {
    const classes = ['card'];
    if (g.played) classes.push('is-played');
    if (g.id === justToggled) classes.push('just-toggled');
    return `<article class="${classes.join(' ')}" data-id="${esc(g.id)}">
      <button type="button" class="cover" data-action="open" aria-label="${esc(g.title)}: ayrıntılar">
        ${coverHTML(g)}
        ${youtubeId(g.video) ? `<span class="cover-video">${icon('play')}Video</span>` : ''}
        <span class="stamp" aria-hidden="true">${icon('check')}Oynandı</span>
      </button>
      <div class="card-body">
        <div class="card-meta">
          <button type="button" class="chip" data-action="category" data-category="${esc(g.category)}" aria-label="${esc(g.category)} kategorisini göster">${esc(g.category)}</button>
          ${g.platform ? `<span class="platform">${esc(g.platform)}</span>` : ''}
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
      if (prefs.status === 'played' && !g.played) return false;
      if (prefs.status === 'todo' && g.played) return false;
      if (prefs.category !== 'all' && g.category !== prefs.category) return false;
      if (q && !lower(`${g.title} ${g.category} ${g.platform} ${g.description}`).includes(q)) return false;
      return true;
    });
    const byTitle = (a, b) => a.title.localeCompare(b.title, 'tr');
    const sorters = {
      recent: (a, b) => String(b.addedAt).localeCompare(String(a.addedAt)) || byTitle(a, b),
      az: byTitle,
      rating: (a, b) => b.rating - a.rating || byTitle(a, b),
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

  function renderStats() {
    const total = data.games.length;
    const played = data.games.filter((g) => g.played).length;
    const pct = total ? Math.round((played / total) * 100) : 0;
    el.saveCount.textContent = `${played} / ${total}`;
    el.savePct.textContent = `%${pct}`;
    el.xpFill.style.width = `${pct}%`;
    el.xpBar.setAttribute('aria-valuenow', String(pct));
    el.xpBar.setAttribute('aria-valuetext', `${total} oyunun ${played} tanesi oynandı`);
    el.statPlayed.textContent = played;
    el.statTodo.textContent = total - played;
    el.statCats.textContent = categoryCounts().length;
  }

  function renderFilters() {
    const total = data.games.length;
    const played = data.games.filter((g) => g.played).length;
    $('[data-count="all"]').textContent = total;
    $('[data-count="played"]').textContent = played;
    $('[data-count="todo"]').textContent = total - played;
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

  function openDetail(id) {
    const g = findGame(id);
    if (!g) return;
    detailId = id;
    const vid = youtubeId(g.video);
    const link = safeLink(g.video);

    let media;
    if (vid && canEmbed) {
      media = `<button type="button" class="cover" data-detail="play" aria-label="Videoyu oynat">${coverHTML(g)}<span class="play-big">${icon('play')}</span></button>`;
    } else if (vid && link) {
      media = `<a class="cover" href="${esc(link)}" target="_blank" rel="noopener" aria-label="Videoyu YouTube'da aç">${coverHTML(g)}<span class="play-big">${icon('play')}</span></a>`;
    } else if (safeImage(g.cover)) {
      media = `<div class="cover">${coverHTML(g)}</div>`;
    } else {
      media = `<div class="cover cover-banner">${coverHTML(g)}</div>`;
    }

    const facts = [
      ['Kategori', esc(g.category)],
      ['Platform', esc(g.platform || '—')],
      ['Puanım', g.rating ? starsHTML(g.rating) : 'Puan yok'],
      ['Durum', g.played ? `<span class="done">Oynandı${g.playedAt ? ` · ${esc(formatDate(g.playedAt))}` : ''}</span>` : 'Sırada'],
      ['Listeye eklendi', esc(formatDate(g.addedAt) || '—')]
    ];

    const actions = [];
    if (link) actions.push(`<a class="btn btn-yt" href="${esc(link)}" target="_blank" rel="noopener">${icon('youtube')}<span>YouTube'da izle</span></a>`);
    if (prefs.editing) {
      actions.push(`<button type="button" class="tick" data-detail="toggle" aria-pressed="${g.played}"><span class="tick-box">${icon('check')}</span>Oynadım</button>`);
      actions.push(`<button type="button" class="btn btn-ghost" data-detail="edit">${icon('edit')}<span>Düzenle</span></button>`);
    }

    el.detailContent.innerHTML = `
      <div class="detail-media">
        ${media}
        <button type="button" class="icon-btn detail-close" data-close aria-label="Kapat">${icon('x')}</button>
      </div>
      <div class="detail-body">
        <h2 id="detailTitle">${esc(g.title)}</h2>
        <dl class="detail-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <p class="detail-desc${g.description ? '' : ' is-empty'}">${g.description ? esc(g.description) : 'Bu oyun için henüz açıklama yazılmadı.'}</p>
        ${actions.length ? `<div class="detail-actions">${actions.join('')}</div>` : ''}
      </div>`;
    openDialog(el.detailDialog);
  }

  el.detailContent.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-detail]');
    if (!btn) return;
    const g = findGame(detailId);
    if (!g) return;
    const action = btn.dataset.detail;
    if (action === 'play') {
      const vid = youtubeId(g.video);
      btn.outerHTML = `<div class="cover"><iframe src="https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0" title="${esc(g.title)} videosu" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
    } else if (action === 'toggle') {
      togglePlayed(g.id);
      openDetail(g.id);
    } else if (action === 'edit') {
      closeDialog(el.detailDialog);
      openForm(g.id);
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
          data.games.splice(Math.min(index, data.games.length), 0, removed);
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
    video: $('#f-video'),
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

  function updateCoverPreview() {
    const preview = { title: f.title.value.trim() || 'Yeni oyun', cover: formCover, video: f.video.value };
    f.coverPreview.innerHTML = coverHTML(preview);
    const uploaded = formCover.startsWith('data:');
    if (uploaded) f.coverHint.textContent = 'Bilgisayardan yüklenen görsel kullanılıyor.';
    else if (formCover) f.coverHint.textContent = 'Linkteki görsel kullanılıyor.';
    else if (youtubeId(f.video.value)) f.coverHint.textContent = 'Görsel yok; videonun küçük resmi kullanılıyor.';
    else f.coverHint.textContent = 'Boş bırakırsan otomatik bir kapak çizilir.';
    f.coverClear.hidden = !formCover;
  }

  function syncPlayedAt() {
    f.playedAt.disabled = !f.played.checked;
    if (f.played.checked && !f.playedAt.value) f.playedAt.value = todayISO();
  }

  function clearErrors() {
    for (const node of $$('.field-error', el.formDialog)) node.hidden = true;
    for (const node of $$('.is-invalid', el.formDialog)) node.classList.remove('is-invalid');
  }

  function showError(input, errorId) {
    input.classList.add('is-invalid');
    $(`#${errorId}`).hidden = false;
  }

  function openForm(id) {
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
    f.video.value = g ? g.video : '';
    formCover = g ? g.cover : '';
    f.cover.value = formCover.startsWith('data:') ? '' : formCover;
    f.coverFile.value = '';
    f.played.checked = g ? g.played : false;
    f.playedAt.value = g && g.playedAt ? String(g.playedAt).slice(0, 10) : '';
    setRating(g ? g.rating : 0);
    syncPlayedAt();
    updateCoverPreview();
    openDialog(el.formDialog);
    setTimeout(() => f.title.focus(), 30);
  }

  // yazmaya başlayınca o alanın hata mesajı kalksın
  for (const [input, errorId] of [[f.title, 'f-title-error'], [f.category, 'f-category-error'], [f.video, 'f-video-error']]) {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      $(`#${errorId}`).hidden = true;
    });
  }
  f.played.addEventListener('change', syncPlayedAt);
  f.title.addEventListener('input', updateCoverPreview);
  f.video.addEventListener('input', updateCoverPreview);
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
    const video = f.video.value.trim();
    let firstInvalid = null;
    if (!title) {
      showError(f.title, 'f-title-error');
      firstInvalid = firstInvalid || f.title;
    }
    if (!category) {
      showError(f.category, 'f-category-error');
      firstInvalid = firstInvalid || f.category;
    }
    if (video && !safeLink(video)) {
      showError(f.video, 'f-video-error');
      firstInvalid = firstInvalid || f.video;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const checked = $('input[name="rating"]:checked', f.stars);
    const played = f.played.checked;
    const values = {
      title,
      category,
      platform: f.platform.value.trim(),
      description: f.desc.value.trim(),
      video,
      cover: formCover,
      rating: checked ? Number(checked.value) : 0,
      played,
      playedAt: played ? (f.playedAt.value || todayISO()) : null
    };

    const existing = formId ? findGame(formId) : null;
    if (existing) {
      if (values.played && !existing.played) justToggled = existing.id;
      Object.assign(existing, values);
      toast(`“${title}” güncellendi.`);
    } else {
      const game = normalizeGame({ ...values, id: uid(), addedAt: new Date().toISOString() });
      data.games.push(game);
      if (game.played) justToggled = game.id;
      // yeni oyun filtrelerde gizli kalmasın
      const hidden = (prefs.status === 'played' && !game.played) || (prefs.status === 'todo' && game.played) ||
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

  // Adres #duzenle ile açılırsa düzenleme modu açılır (ör. siteadresi/#duzenle)
  if (location.hash === '#duzenle') prefs.editing = true;

  document.documentElement.lang = 'tr';
  applyTheme();
  render();
})();
