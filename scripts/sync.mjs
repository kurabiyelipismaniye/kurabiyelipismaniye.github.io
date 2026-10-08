#!/usr/bin/env node
/* Oyun Arşivi — otomatik eşitleme. GitHub Actions saatte bir çalıştırır (bkz. .github/workflows/sync.yml).
   1) Firebase kuruluysa Firestore'daki herkese açık veriyi okur; backup/firestore-backup.json yedeğini ve
      site Firebase'e ulaşamadığında gösterilen data/games.js dosyasını günceller.
   2) YouTube kanalının RSS akışındaki son videoları data/latest.json dosyasına yazar.
   3) Oyunların Steam mağaza sayfasını adıyla arar ve data/steam.json dosyasına yazar.
   4) Bölüm videolarının süresini YouTube'dan okur ve data/durations.json dosyasına yazar (istatistikler için).
   Dosyalar yalnızca içerik değiştiğinde yeniden yazılır. Bağımlılık yok: Node 18+ ve yerleşik fetch yeterli.
   Testler için: FIRESTORE_BASE (ör. http://127.0.0.1:8080), YOUTUBE_BASE (ör. http://127.0.0.1:9000) ve STEAM_BASE. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  config: 'js/config.js',
  games: 'data/games.js',
  latest: 'data/latest.json',
  steam: 'data/steam.json',
  durations: 'data/durations.json',
  backup: 'backup/firestore-backup.json'
};

// sondaki "/" ve Firestore için "/v1" atılır; ikisi de verilebilsin
const trimBase = (s) => String(s).trim().replace(/\/+$/, '');
const FIRESTORE_BASE = trimBase(process.env.FIRESTORE_BASE || 'https://firestore.googleapis.com').replace(/\/v1$/, '');
const YOUTUBE_BASE = trimBase(process.env.YOUTUBE_BASE || 'https://www.youtube.com');
const STEAM_BASE = trimBase(process.env.STEAM_BASE || 'https://store.steampowered.com');

const TIMEOUT_MS = 30000;
const RETRY_MS = 2000;
const MAX_VIDEOS = 15;
const MAX_BACKUP_CHARS = 90e6; // GitHub 100 MB'tan büyük dosyayı kabul etmez
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'Cookie': 'CONSENT=YES+cb; SOCS=CAI'
};

// data/games.js okunaklı kalsın diye bilinen alanlar sitenin kullandığı sırayla yazılır, gerisi alfabetik
const SITE_KEYS = ['channelName', 'title', 'tagline', 'youtubeUrl', 'githubEditUrl'];
const GAME_KEYS = ['id', 'title', 'category', 'platform', 'description', 'cover', 'steamUrl', 'rating', 'queueOrder', 'suggestion', 'played', 'playedAt', 'addedAt', 'episodes', 'example'];
const EPISODE_KEYS = ['id', 'title', 'url', 'date'];
const IMAGE_KEYS = ['id', 'createdAt', 'data'];
const SUGGESTION_KEYS = ['id', 'title', 'note', 'name', 'category', 'votes', 'status', 'gameId', 'createdAt'];

/* ---------- yardımcılar ---------- */
const inActions = process.env.GITHUB_ACTIONS === 'true';
const log = (msg) => console.log(msg);
// Actions'ta "::warning::" satırı çalışma özetinde sarı uyarı olarak görünür
const warn = (msg) => console.log(inActions ? `::warning::${String(msg).replace(/\r?\n/g, ' ')}` : `Uyarı: ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const CHANNEL_ID = /^UC[\w-]{22}$/;

const abs = (rel) => path.join(ROOT, rel);
const readText = (rel) => {
  try { return fs.readFileSync(abs(rel), 'utf8'); } catch { return null; }
};
function readJson(rel) {
  const t = readText(rel);
  if (t == null) return null;
  try { return JSON.parse(t); } catch { return null; }
}
// önce geçici dosyaya yazılır; yarıda kesilirse eski dosya bozulmaz
function writeText(rel, text) {
  const file = abs(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// Anahtar sırasından bağımsız karşılaştırma için kararlı JSON
function stable(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stable(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

function ordered(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  for (const k of Object.keys(obj).sort()) if (!(k in out)) out[k] = obj[k];
  return out;
}

// Tarayıcı dosyası (window.X = …) bir vm kutusunda çalıştırılır; window kutunun kendisidir
function evalBrowserFile(code, name) {
  const box = {};
  box.window = box;
  vm.createContext(box);
  vm.runInContext(code, box, { filename: name, timeout: 2000 });
  return box;
}

function readConfig() {
  const code = readText(FILES.config);
  if (code == null) throw new Error(`${FILES.config} bulunamadı`);
  const cfg = evalBrowserFile(code, FILES.config).SITE_CONFIG;
  if (!isObj(cfg)) throw new Error(`${FILES.config} içinde window.SITE_CONFIG nesnesi yok`);
  // vm kutusundaki nesneler düz JSON'a çevrilir
  return JSON.parse(JSON.stringify(cfg));
}

function readSiteData() {
  const code = readText(FILES.games);
  if (code == null) return null;
  try {
    const d = evalBrowserFile(code, FILES.games).SITE_DATA;
    return isObj(d) ? JSON.parse(JSON.stringify(d)) : null;
  } catch (err) {
    warn(`${FILES.games} okunamadı: ${err.message}`);
    return null;
  }
}

function httpError(status, body, url) {
  let detail = '';
  try {
    const e = JSON.parse(body).error;
    detail = e ? [e.status, e.message].filter(Boolean).join(': ') : '';
  } catch { /* JSON değil */ }
  if (!detail) detail = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const err = new Error(`HTTP ${status}${detail ? ` (${detail})` : ''} — ${url.replace(/([?&]key=)[^&]+/, '$1…')}`);
  err.status = status;
  return err;
}

// Zaman aşımı ve bir kez yeniden deneme; 4xx'te (retry404 dışında) tekrar denenmez
async function request(url, { headers = {}, retry404 = false } = {}) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(RETRY_MS);
    try {
      const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = await res.text();
      if (res.ok) return body;
      last = httpError(res.status, body, url);
      const again = res.status >= 500 || res.status === 429 || (retry404 && res.status === 404);
      if (!again) break;
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

/* ---------- Firestore (REST, herkese açık okuma) ---------- */
// "2026-10-07T12:00:00.123456Z" → milisaniye; nanosaniye kısmı kesilir (Timestamp.toMillis gibi)
function toMillis(ts) {
  const ms = Date.parse(String(ts).replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(ms) ? ms : null;
}

function fromValue(v) {
  if (!isObj(v)) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) {
    const n = Number(v.integerValue);
    return Number.isSafeInteger(n) ? n : String(v.integerValue);
  }
  if ('doubleValue' in v) {
    const n = Number(v.doubleValue);
    return Number.isFinite(n) ? n : null;
  }
  if ('timestampValue' in v) return toMillis(v.timestampValue);
  if ('stringValue' in v) return String(v.stringValue);
  if ('bytesValue' in v) return String(v.bytesValue);
  if ('referenceValue' in v) return String(v.referenceValue);
  if ('geoPointValue' in v) {
    const g = v.geoPointValue || {};
    return { latitude: Number(g.latitude) || 0, longitude: Number(g.longitude) || 0 };
  }
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue && v.mapValue.fields);
  return null;
}

function fromFields(fields) {
  const out = {};
  for (const k of Object.keys(fields || {}).sort()) out[k] = fromValue(fields[k]);
  return out;
}

const docId = (doc) => String(doc.name).split('/').pop();

function firestore(fb) {
  const root = `${FIRESTORE_BASE}/v1/projects/${encodeURIComponent(fb.projectId)}/databases/(default)/documents`;
  const url = (segments, params = {}) => {
    const qs = new URLSearchParams({ ...params, ...(fb.apiKey ? { key: fb.apiKey } : {}) }).toString();
    return `${root}/${segments.map(encodeURIComponent).join('/')}${qs ? `?${qs}` : ''}`;
  };
  return {
    // belge yoksa null
    async get(...segments) {
      try {
        return JSON.parse(await request(url(segments)));
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },
    // koleksiyonun tüm belgeleri, sayfa sayfa
    async list(segments, pageSize = 300) {
      const docs = [];
      let token = '';
      for (;;) {
        const page = JSON.parse(await request(url(segments, { pageSize: String(pageSize), ...(token ? { pageToken: token } : {}) })));
        docs.push(...(page.documents || []));
        if (!page.nextPageToken || page.nextPageToken === token) break;
        token = page.nextPageToken;
      }
      return docs;
    }
  };
}

// Galeri görselleri büyük olduğu için her saat değil, günde bir kez (UTC 03:00 çalışmasında) ya da
// elle çalıştırınca (FULL_BACKUP=1) indirilir; diğer saatlerde önceki yedekteki görseller korunur.
const FULL_BACKUP = process.env.FULL_BACKUP === '1' || new Date().getUTCHours() === 3;

function previousImages() {
  const prev = readJson(FILES.backup);
  const map = new Map();
  if (prev && Array.isArray(prev.games)) {
    for (const g of prev.games) if (isObj(g) && Array.isArray(g.images)) map.set(String(g.id), g.images);
  }
  return map;
}

async function readFirestore(fb) {
  const db = firestore(fb);
  // önce oyunlar: veritabanı hiç oluşturulmadıysa ya da kurallar okumayı engelliyorsa burada hata verir.
  // Oyun belgelerinde yüklenmiş kapak olabilir; yanıt şişmesin diye sayfalar küçük tutulur.
  const gameDocs = await db.list(['games'], 50);
  const siteDoc = await db.get('site', 'settings');
  const site = siteDoc ? ordered(fromFields(siteDoc.fields), SITE_KEYS) : null;

  const games = [];
  const prevImages = FULL_BACKUP ? null : previousImages();
  for (const doc of gameDocs) {
    const id = docId(doc);
    const game = gameShape({ ...fromFields(doc.fields), id });
    if (prevImages) {
      games.push({ ...game, images: prevImages.get(id) || [] });
      continue;
    }
    const images = (await db.list(['games', id, 'images'], 20))
      .map((d) => ordered({ createdAt: null, ...fromFields(d.fields), id: docId(d) }, IMAGE_KEYS))
      .sort((a, b) => {
        const ta = typeof a.createdAt === 'number' ? a.createdAt : Infinity;
        const tb = typeof b.createdAt === 'number' ? b.createdAt : Infinity;
        return ta === tb ? byStr(a.id, b.id) : ta < tb ? -1 : 1;
      });
    games.push({ ...game, images });
  }
  games.sort((a, b) => byStr(a.id, b.id));

  // öneriler sitedeki gibi en yeni üstte
  const suggestions = (await db.list(['suggestions']))
    .map((d) => ordered({ ...fromFields(d.fields), id: docId(d) }, SUGGESTION_KEYS))
    .sort((a, b) => {
      const ta = typeof a.createdAt === 'number' ? a.createdAt : -Infinity;
      const tb = typeof b.createdAt === 'number' ? b.createdAt : -Infinity;
      return ta === tb ? byStr(a.id, b.id) : tb > ta ? 1 : -1;
    });

  return { site, games, suggestions };
}

function gameShape(g) {
  const out = ordered(g, GAME_KEYS);
  if (Array.isArray(out.episodes)) out.episodes = out.episodes.map((e) => (isObj(e) ? ordered(e, EPISODE_KEYS) : e));
  return out;
}

function writeBackup({ site, games, suggestions }) {
  // liste henüz buluta aktarılmadıysa boş bir yedek yazmanın anlamı yok
  if (!site && !games.length && !suggestions.length) {
    log(`Firestore henüz boş; ${FILES.backup} yazılmadı.`);
    return;
  }
  const content = { site, games, suggestions };
  const prev = readJson(FILES.backup);
  if (prev && stable({ site: prev.site, games: prev.games, suggestions: prev.suggestions }) === stable(content)) {
    log(`${FILES.backup}: değişiklik yok.`);
    return;
  }
  const text = `${JSON.stringify({ exportedAt: new Date().toISOString(), ...content }, null, 2)}\n`;
  if (text.length > MAX_BACKUP_CHARS) {
    warn(`${FILES.backup} çok büyük (${Math.round(text.length / 1e6)} MB); GitHub kabul etmeyeceği için yazılmadı. Görsel sayısını azaltmak gerekiyor.`);
    return;
  }
  writeText(FILES.backup, text);
  const imageCount = games.reduce((n, g) => n + g.images.length, 0);
  log(`${FILES.backup} güncellendi: ${games.length} oyun, ${imageCount} görsel, ${suggestions.length} öneri.`);
}

function writeGamesJs({ site, games }) {
  const prev = readSiteData();
  // Firestore henüz boşsa (liste buluta aktarılmadıysa) eldeki liste silinmesin
  if (!site && !games.length) {
    log(`Firestore'da henüz oyun ya da site ayarı yok; ${FILES.games} olduğu gibi bırakıldı.`);
    return;
  }
  const outSite = ordered(site || (prev && isObj(prev.site) ? prev.site : {}), SITE_KEYS);
  // görseller ve yüklenmiş (data:) kapaklar bu dosyaya alınmaz; dosya küçük kalır
  const outGames = games.map(({ images, ...g }) => {
    const game = { ...g };
    if (typeof game.cover === 'string' && /^\s*data:/i.test(game.cover)) game.cover = '';
    return game;
  });
  if (prev && stable({ site: prev.site, games: prev.games }) === stable({ site: outSite, games: outGames })) {
    log(`${FILES.games}: değişiklik yok.`);
    return;
  }
  const prevVersion = (prev && Number(prev.version)) || 0;
  const version = Math.max(Date.now(), prevVersion + 1);
  const text = [
    '// Oyun Arşivi verisi. Firebase\'deki listeden otomatik oluşturulur (scripts/sync.mjs); elle düzenlemene gerek yok.',
    '// Site Firebase\'e ulaşamadığında bu liste gösterilir. Yüklenen kapak görselleri dosya küçük kalsın diye buraya alınmaz.',
    `window.SITE_DATA = ${JSON.stringify({ version, site: outSite, games: outGames }, null, 2)};`,
    ''
  ].join('\n');
  writeText(FILES.games, text);
  log(`${FILES.games} güncellendi: ${outGames.length} oyun (sürüm ${version}).`);
}

/* ---------- YouTube ---------- */
// Kanal linkini çözümler: { url, channelId } ya da sayfası okunacak { url, pagePath }
function parseChannelUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('@')) s = `https://www.youtube.com/${s}`;
  else if (!/^[a-z][a-z\d+.-]*:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host === 'youtu.be') {
    const vid = u.pathname.slice(1).split('/')[0];
    return vid ? { url: '', pagePath: `/watch?v=${encodeURIComponent(vid)}` } : null;
  }
  if (!/^((www|m|music)\.)?youtube\.com$/.test(host)) return null;
  const p = u.pathname.replace(/\/+$/, '');
  const dec = (x) => {
    try { return decodeURIComponent(x); } catch { return x; }
  };
  let m;
  if ((m = p.match(/^\/channel\/(UC[\w-]{22})(?:\/|$)/))) return { url: `https://www.youtube.com/channel/${m[1]}`, channelId: m[1] };
  if ((m = p.match(/^\/(@[^/]+)/))) return { url: `https://www.youtube.com/${dec(m[1])}`, pagePath: `/${m[1]}` };
  if ((m = p.match(/^\/(c|user)\/([^/]+)/))) return { url: `https://www.youtube.com/${m[1]}/${dec(m[2])}`, pagePath: `/${m[1]}/${m[2]}` };
  // eski tip özel adres: youtube.com/KanalAdi
  const reserved = /^\/(watch|shorts|live|playlist|results|feed|embed|v|channel|c|user|redirect|hashtag|post)(\/|$)/;
  if ((m = p.match(/^\/([^/@]+)$/)) && !reserved.test(p)) return { url: `https://www.youtube.com/${dec(m[1])}`, pagePath: `/${m[1]}` };
  // video ya da başka bir sayfa: kanal kimliği sayfadan bulunur, link kanal adresi olur
  return p || u.search ? { url: '', pagePath: `${p || '/'}${u.search}` } : null;
}

function extractChannelId(html) {
  const h = String(html).replace(/\\x22/g, '"');
  const attr = (tag, name) => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
    return m ? m[1] : '';
  };
  let m = h.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/);
  if (m) return m[1];
  for (const tag of h.match(/<meta\b[^>]*>/gi) || []) {
    if (/^identifier$/i.test(attr(tag, 'itemprop')) && CHANNEL_ID.test(attr(tag, 'content'))) return attr(tag, 'content');
  }
  for (const tag of h.match(/<link\b[^>]*>/gi) || []) {
    if (!/^canonical$/i.test(attr(tag, 'rel'))) continue;
    m = attr(tag, 'href').match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/channel\/(UC[\w-]{22})(?:[/?#]|$)/);
    if (m) return m[1];
  }
  m = h.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/);
  return m ? m[1] : '';
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.replace(/&/g, '&amp;')) // CDATA içi olduğu gibi kalsın
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(code); } catch { return all; }
      }
      return XML_ENTITIES[e.toLowerCase()] ?? all;
    })
    .trim();
}

const tagText = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1]) : '';
};

function toIso(s) {
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : String(s || '');
}

function parseFeed(xml) {
  if (!/<feed\b/.test(xml)) throw new Error('YouTube yanıtı bir RSS/Atom akışı değil');
  const head = xml.split(/<entry\b/)[0];
  const author = (head.match(/<author\b[\s\S]*?<\/author>/) || [''])[0];
  const channelTitle = tagText(head, 'title') || tagText(author, 'name');
  const videos = [];
  const entries = xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/g) || [];
  entries.forEach((entry, order) => {
    const id = tagText(entry, 'yt:videoId');
    if (!/^[\w-]{6,20}$/.test(id)) return;
    const links = (entry.match(/<link\b[^>]*>/g) || []).map((t) => (t.match(/\bhref\s*=\s*["']([^"']*)["']/) || [])[1] || '');
    const published = tagText(entry, 'published');
    videos.push({
      id,
      title: tagText(entry, 'title'),
      url: `https://www.youtube.com/watch?v=${id}`,
      published: published ? toIso(published) : '',
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      isShort: links.some((l) => decodeXml(l).includes('/shorts/')),
      order
    });
  });
  // akış zaten yeniden eskiye gelir; yine de yayın tarihine göre sıralanır
  videos.sort((a, b) => byStr(b.published, a.published) || a.order - b.order);
  return { channelTitle, videos: videos.slice(0, MAX_VIDEOS).map(({ order, ...v }) => v) };
}

async function syncLatest(site, cfg) {
  const fromSite = site && typeof site.youtubeUrl === 'string' ? site.youtubeUrl.trim() : '';
  const fromConfig = cfg.youtube && typeof cfg.youtube.channelUrl === 'string' ? cfg.youtube.channelUrl.trim() : '';
  const raw = fromSite || fromConfig;
  if (!raw) {
    log('YouTube kanal linki girilmemiş; son videolar adımı atlandı.');
    return;
  }
  const ch = parseChannelUrl(raw);
  if (!ch) {
    warn(`YouTube kanal linki anlaşılamadı: "${raw}". Site ayarlarına https://www.youtube.com/@kanal gibi bir link yaz.`);
    return;
  }
  const prev = readJson(FILES.latest);
  let channelId = ch.channelId || '';
  // aynı kanal linki için kimlik daha önce bulunduysa kanal sayfası yeniden açılmaz
  if (!channelId && ch.url && prev && prev.channelUrl === ch.url && CHANNEL_ID.test(String(prev.channelId))) channelId = prev.channelId;
  if (!channelId) {
    const html = await request(`${YOUTUBE_BASE}${ch.pagePath}`, { headers: BROWSER_HEADERS });
    channelId = extractChannelId(html);
    if (!channelId) throw new Error(`kanal sayfasında kanal kimliği bulunamadı (${raw})`);
    log(`Kanal kimliği bulundu: ${channelId}`);
  }
  const xml = await request(`${YOUTUBE_BASE}/feeds/videos.xml?channel_id=${channelId}`, { retry404: true });
  const feed = parseFeed(xml);
  const content = {
    channelId,
    channelTitle: feed.channelTitle,
    channelUrl: ch.url || `https://www.youtube.com/channel/${channelId}`,
    videos: feed.videos
  };
  if (prev && stable({ ...prev, fetchedAt: null }) === stable({ ...content, fetchedAt: null })) {
    log(`${FILES.latest}: değişiklik yok.`);
    return;
  }
  const { videos, ...head } = content;
  writeText(FILES.latest, `${JSON.stringify({ ...head, fetchedAt: new Date().toISOString(), videos }, null, 2)}\n`);
  log(`${FILES.latest} güncellendi: ${videos.length} video${videos[0] ? `, en yenisi "${videos[0].title}"` : ''}.`);
}

/* ---------- Steam ---------- */
// Her oyun adıyla Steam mağazasında aranır. Yalnızca adı birebir tutan (büyük/küçük harf, ™ ® işaretleri ve
// noktalama farkı sayılmaz) ilk uygulama kabul edilir; emin olunamazsa link verilmez (ör. "Minecraft" araması
// "Minecraft Dungeons" döndürür, o kabul edilmez). Sonuç oyun kimliğiyle ve arandığı adla saklanır; ad değişirse
// yeniden aranır. Bulunamayanlar haftada bir yeniden denenir. Elle Steam linki (ya da "yok") girilmiş oyunlar aranmaz.
const STEAM_MAX_LOOKUPS = 25; // bir çalışmada en fazla bu kadar arama; kalanlar sonraki saate kalır
const STEAM_RETRY_MS = 7 * 86400000;
const STEAM_DELAY_MS = 1500; // aramalar arası bekleme, Steam'i yormamak için

// "DARK SOULS™ III" = "Dark Souls III", "Baldur's Gate 3" = "Baldurs Gate 3", "S.T.A.L.K.E.R." = "STALKER":
// işaretler ve kelime içindeki kesme/nokta/virgül atılır, öteki noktalama boşluk sayılır.
function steamKey(s) {
  return String(s || '').replace(/[\u2122\u00ae\u00a9]/g, '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i').replace(/['\u2019.,]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function findOnSteam(title) {
  const url = `${STEAM_BASE}/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`;
  const body = await request(url, { headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'], 'Accept': 'application/json' } });
  let json;
  try { json = JSON.parse(body); } catch { throw new Error(`Steam yanıtı JSON değil — ${url}`); }
  const items = isObj(json) && Array.isArray(json.items) ? json.items : [];
  const want = steamKey(title);
  if (!want) return null; // Latin harfi ya da rakamı olmayan ad (ör. yalnızca Çince) güvenle eşleştirilemez
  const hit = items.find((it) => isObj(it) && it.type === 'app' && Number.isInteger(it.id) && it.id > 0 && steamKey(it.name) === want);
  return hit ? { appid: hit.id, name: String(hit.name).trim() } : null;
}

async function syncSteam(games) {
  const prev = readJson(FILES.steam);
  const old = prev && isObj(prev.games) ? prev.games : {};
  const now = Date.now();
  const out = {};
  const todo = [];
  for (const g of games) {
    if (!isObj(g) || typeof g.id !== 'string' || !g.id) continue;
    const title = typeof g.title === 'string' ? g.title.trim() : '';
    if (!title || (typeof g.steamUrl === 'string' && g.steamUrl.trim())) continue; // elle girilmiş
    const e = isObj(old[g.id]) ? old[g.id] : null;
    const fresh = e && e.title === title && (Number.isInteger(e.appid) && e.appid > 0
      || (e.appid === null && now - Date.parse(e.checkedAt || 0) < STEAM_RETRY_MS));
    if (fresh) out[g.id] = e;
    else todo.push({ id: g.id, title, prev: e });
  }
  let looked = 0;
  for (const t of todo) {
    if (looked >= STEAM_MAX_LOOKUPS) {
      // aranamayanların eski kaydı (varsa ve adı tutuyorsa) korunur
      if (t.prev && t.prev.title === t.title) out[t.id] = t.prev;
      continue;
    }
    if (looked) await sleep(STEAM_DELAY_MS);
    looked++;
    try {
      const hit = await findOnSteam(t.title);
      out[t.id] = hit
        ? { title: t.title, appid: hit.appid, name: hit.name }
        : { title: t.title, appid: null, checkedAt: new Date(now).toISOString().slice(0, 10) };
      log(hit ? `Steam: "${t.title}" → ${hit.name} (${hit.appid})` : `Steam: "${t.title}" için birebir eşleşen oyun bulunamadı.`);
    } catch (err) {
      warn(`Steam araması yapılamadı ("${t.title}"): ${err.message}. Kalan oyunlar sonraki çalışmada aranacak.`);
      if (t.prev && t.prev.title === t.title) out[t.id] = t.prev;
      looked = STEAM_MAX_LOOKUPS; // Steam'e ulaşılamıyorsa bu çalışmada başka arama yapılmaz
    }
  }
  if (todo.length > STEAM_MAX_LOOKUPS) log(`Steam: ${todo.length - STEAM_MAX_LOOKUPS} oyun sonraki çalışmada aranacak.`);
  const sorted = {};
  for (const id of Object.keys(out).sort(byStr)) sorted[id] = out[id];
  if (prev && stable(prev.games || {}) === stable(sorted)) {
    log(`${FILES.steam}: değişiklik yok.`);
    return;
  }
  writeText(FILES.steam, `${JSON.stringify({ updatedAt: new Date(now).toISOString(), games: sorted }, null, 2)}\n`);
  const found = Object.values(sorted).filter((e) => e.appid).length;
  log(`${FILES.steam} güncellendi: ${found} oyunun Steam sayfası bulundu.`);
}

/* ---------- bölüm süreleri ---------- */
// YouTube'un RSS akışında süre yok; her bölüm videosunun sayfasındaki "lengthSeconds" bir kez okunur ve saklanır.
// Süresi okunamayan (gizli, silinmiş ya da henüz yayınlanmamış) videolar günde bir yeniden denenir. Son iki günde
// yayınlanan bölümler (prömiyer, planlanmış video, canlı yayın dahil) her çalışmada önce denenir; süre yayından sonraki
// ilk çalışmada gelir. İleri tarihli bölümler en sona kalır, böylece çok sayıda planlanmış bölüm diğerlerini bekletmez.
const DURATION_MAX_LOOKUPS = 20;
const DURATION_RETRY_MS = 86400000;
const DURATION_DELAY_MS = 1000;
// sitedeki youtubeId ile aynı: watch?v=, youtu.be/, embed/, shorts/, live/, v/
const YT_ID = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))(?!videoseries|live_stream)([A-Za-z0-9_-]{11})/;

const DURATION_RECENT_DAYS = 2;

// Bölümlerdeki YouTube videoları; "recent": son iki günde yayınlananlar, "future": ileri tarihliler.
// Tarihler sitenin yerel tarihidir; "bugün" en ileri saat dilimine (UTC+14) göre alınır ki bugünkü bölüm ileri sayılmasın.
function episodeVideoIds(games, now = Date.now()) {
  const ids = new Set();
  const recent = new Set();
  const future = new Set();
  const since = new Date(now - DURATION_RECENT_DAYS * 86400000).toISOString().slice(0, 10);
  const today = new Date(now + 14 * 3600000).toISOString().slice(0, 10);
  for (const g of games) {
    if (!isObj(g) || !Array.isArray(g.episodes)) continue;
    for (const e of g.episodes) {
      const m = isObj(e) && typeof e.url === 'string' ? e.url.replace(/&amp;/gi, '&').match(YT_ID) : null;
      if (!m) continue;
      ids.add(m[1]);
      if (typeof e.date !== 'string' || e.date < since) continue;
      if (e.date <= today) recent.add(m[1]);
      else future.add(m[1]);
    }
  }
  for (const id of recent) future.delete(id); // aynı video hem yayınlanmış hem ileri tarihli bölümde
  return { ids: [...ids].sort(byStr), recent, future };
}

function parseDuration(html) {
  const m = html.match(/"lengthSeconds":"(\d+)"/) || html.match(/itemprop="duration" content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/);
  if (!m) return 0;
  if (m.length === 2) return Number(m[1]) || 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

async function syncDurations(games) {
  const prev = readJson(FILES.durations);
  const oldVideos = prev && isObj(prev.videos) ? prev.videos : {};
  const oldFailed = prev && isObj(prev.failed) ? prev.failed : {};
  const now = Date.now();
  const videos = {};
  const failed = {};
  const todo = [];
  const { ids, recent, future } = episodeVideoIds(games, now);
  for (const id of ids) {
    if (Number.isInteger(oldVideos[id]) && oldVideos[id] > 0) videos[id] = oldVideos[id];
    else if (oldFailed[id] && !recent.has(id) && now - Date.parse(oldFailed[id]) < DURATION_RETRY_MS) failed[id] = oldFailed[id];
    else todo.push(id);
  }
  const rank = (id) => (recent.has(id) ? 0 : future.has(id) ? 2 : 1);
  todo.sort((a, b) => rank(a) - rank(b)); // yeni bölümler önce, planlanmışlar en son
  let looked = 0;
  for (const id of todo) {
    if (looked >= DURATION_MAX_LOOKUPS) break;
    if (looked) await sleep(DURATION_DELAY_MS);
    looked++;
    try {
      const sec = parseDuration(await request(`${YOUTUBE_BASE}/watch?v=${id}`, { headers: BROWSER_HEADERS }));
      if (sec > 0) videos[id] = sec;
      else failed[id] = new Date(now).toISOString().slice(0, 10);
    } catch (err) {
      warn(`Video süresi okunamadı (${id}): ${err.message}. Kalanlar sonraki çalışmada denenecek.`);
      if (oldFailed[id]) failed[id] = oldFailed[id];
      break; // YouTube'a ulaşılamıyorsa bu çalışmada başka deneme yapılmaz
    }
  }
  if (todo.length > looked) log(`Bölüm süreleri: ${todo.length - looked} video sonraki çalışmada okunacak.`);
  const content = { videos, failed };
  if (prev && stable({ videos: oldVideos, failed: oldFailed }) === stable(content)) {
    log(`${FILES.durations}: değişiklik yok.`);
    return;
  }
  const total = Object.values(videos).reduce((n, x) => n + x, 0);
  writeText(FILES.durations, `${JSON.stringify({ updatedAt: new Date(now).toISOString(), ...content }, null, 2)}\n`);
  log(`${FILES.durations} güncellendi: ${Object.keys(videos).length} videonun süresi biliniyor (toplam ${Math.round(total / 60)} dakika).`);
}

/* ---------- ana akış ---------- */
async function main() {
  let cfg;
  try {
    cfg = readConfig();
  } catch (err) {
    console.error(`Ayar dosyası okunamadı (${FILES.config}): ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let site = null;
  let games = null;
  const fb = isObj(cfg.firebase) ? cfg.firebase : null;
  if (fb && fb.apiKey && fb.projectId) {
    let data = null;
    try {
      data = await readFirestore(fb);
    } catch (err) {
      warn(`Firestore okunamadı, yedek adımı atlandı: ${err.message}. (Veritabanı oluşturuldu ve kurallar yayınlandı mı?)`);
    }
    if (data) {
      site = data.site;
      // liste henüz buluta aktarılmadıysa data/games.js'teki liste kullanılır
      if (data.site || data.games.length) games = data.games;
      try {
        writeBackup(data);
        writeGamesJs(data);
      } catch (err) {
        warn(`Yedek dosyaları yazılamadı: ${err.message}`);
      }
    }
  } else if (fb && fb.apiKey) {
    warn('Firebase ayarında projectId yok; yedek adımı atlandı.');
  } else {
    log('Firebase kurulmamış; yedek adımı atlandı.');
  }
  // Firestore okunamadıysa ya da site ayarı yoksa son bilinen ayarlar data/games.js'ten alınır
  if (!site || !games) {
    const prev = readSiteData();
    if (!site) site = prev && isObj(prev.site) ? prev.site : null;
    if (!games) games = prev && Array.isArray(prev.games) ? prev.games : [];
  }

  try {
    await syncLatest(site, cfg);
  } catch (err) {
    warn(`Son videolar alınamadı, ${FILES.latest} olduğu gibi bırakıldı: ${err.message}`);
  }

  try {
    await syncSteam(games);
  } catch (err) {
    warn(`Steam adımı tamamlanamadı, ${FILES.steam} olduğu gibi bırakıldı: ${err.message}`);
  }

  try {
    await syncDurations(games);
  } catch (err) {
    warn(`Bölüm süreleri alınamadı, ${FILES.durations} olduğu gibi bırakıldı: ${err.message}`);
  }
}

await main();
