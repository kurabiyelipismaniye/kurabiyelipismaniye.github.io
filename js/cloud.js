/* Oyun Arşivi — bulut bağlantısı (Firebase: Firestore veritabanı + e-postayla giriş).
   js/config.js içinde Firebase ayarı yoksa hiçbir şey yüklenmez; site data/games.js ile çalışır.
   Hazır olunca window.cloud doldurulur ve 'cloud-ready' olayı gönderilir.
   Dışarıya yalnızca düz (JSON'a çevrilebilen) nesneler verilir; tarihler milisaniye olarak gelir. */

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';

// Görsel ve öneri alanlarının üst sınırları (firestore.rules ile aynı)
const LIMITS = { cover: 400000, image: 950000, title: 80, note: 400, name: 40, category: 40 };
const STATUSES = ['new', 'added', 'rejected'];

// Bir yazma grubunda en çok 450 işlem ve yaklaşık 8 MB veri gönderilir (Firestore sınırı 500 / 10 MB)
const BATCH_OPS = 450;
const BATCH_BYTES = 8000000;

// firestore.rules dosyasının aynısı; rulesFor() içindeki e-postayı sahibinkiyle değiştirir.
const OWNER_PLACEHOLDER = 'SAHIBIN_EPOSTASI@ornek.com';
const RULES_TEMPLATE = `rules_version = '2';

// Oyun Arşivi — Firestore güvenlik kuralları.
// Herkes okuyabilir, yalnızca site sahibi yazabilir. Ziyaretçiler yalnızca oyun önerisi
// ekleyebilir ve önerilere birer oy verebilir.
// isOwner() içindeki e-posta, sahibin giriş e-postasıdır (küçük harfle). Sitenin kurulum
// sayfası bu dosyayı e-posta yazılmış olarak hazır verir.
service cloud.firestore {
  match /databases/{database}/documents {

    // Giriş yapan kişi site sahibi mi (büyük/küçük harf fark etmez)
    function isOwner() {
      return request.auth != null
        && request.auth.token.email.lower() == '${OWNER_PLACEHOLDER}';
    }

    // Kapak görseli metin olarak saklanır; belge sınırını aşmasın
    function coverOk(d) {
      return !('cover' in d) || d.cover == null
        || (d.cover is string && d.cover.size() < 400000);
    }

    // Ziyaretçinin gönderdiği yeni öneri: yalnızca bu alanlar, 0 oy, "new" durumu, sunucu saati
    function newSuggestionOk(d) {
      return d.keys().hasAll(['title', 'votes', 'status', 'createdAt'])
        && d.keys().hasOnly(['title', 'note', 'name', 'category', 'votes', 'status', 'createdAt'])
        && d.title is string && d.title.size() >= 1 && d.title.size() <= 80
        && d.get('note', '') is string && d.get('note', '').size() <= 400
        && d.get('name', '') is string && d.get('name', '').size() <= 40
        && d.get('category', '') is string && d.get('category', '').size() <= 40
        && d.votes is int && d.votes == 0
        && d.status == 'new'
        && d.createdAt == request.time;
    }

    // Oy: yalnızca "votes" değişir ve tam 1 artar
    function isVote() {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['votes'])
        && request.resource.data.votes is int
        && request.resource.data.votes == resource.data.get('votes', 0) + 1;
    }

    // Site ayarları (başlık, kanal adı, YouTube linki…)
    match /site/{docId} {
      allow read: if true;
      allow write: if isOwner();
    }

    // Oyunlar ve her oyunun görsel galerisi
    match /games/{gameId} {
      allow read: if true;
      allow create, update: if isOwner() && coverOk(request.resource.data);
      allow delete: if isOwner();

      match /images/{imageId} {
        allow read: if true;
        allow create, update: if isOwner()
          && request.resource.data.data is string
          && request.resource.data.data.size() < 950000;
        allow delete: if isOwner();
      }
    }

    // Ziyaretçilerin oyun önerileri
    match /suggestions/{suggestionId} {
      allow read: if true;
      allow create: if newSuggestionOk(request.resource.data);
      allow update: if isOwner() || isVote();
      allow delete: if isOwner();
    }

    // Burada adı geçmeyen her şey kapalıdır.
  }
}
`;

function rulesFor(email) {
  const e = String(email ?? '').trim().toLowerCase();
  // e-posta yoksa yer tutucu kalır; böylece kimse sahip sayılmaz
  if (!e) return RULES_TEMPLATE;
  const literal = `'${e.replace(/[\\']/g, '\\$&')}'`;
  return RULES_TEMPLATE.replace(`'${OWNER_PLACEHOLDER}'`, () => literal);
}

function finish(api) {
  window.cloud = api;
  window.dispatchEvent(new Event('cloud-ready'));
}

/* ---------- yardımcılar ---------- */

// Hata her zaman Error olarak, Firebase kodu .code alanında döner (ör. 'permission-denied')
function toError(err) {
  if (err instanceof Error) {
    if (!err.code) err.code = 'unknown';
    return err;
  }
  const e = new Error(String((err && err.message) || err));
  e.code = (err && err.code) || 'unknown';
  return e;
}

function invalid(message) {
  const e = new Error(message);
  e.code = 'invalid-argument';
  return e;
}

// Belge kimliği: boş olmayan, "/" içermeyen metin
function checkId(id) {
  const s = typeof id === 'number' ? String(id) : id;
  if (typeof s !== 'string' || !s || s.includes('/') || s === '.' || s === '..' || /^__.*__$/.test(s)) {
    throw invalid(`Geçersiz kimlik: ${String(id)}`);
  }
  return s;
}

// Yazmadan önce: undefined alanlar atılır, dizideki undefined null olur, tarih metne döner
function clean(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw invalid('Nesne bekleniyordu');
  return JSON.parse(JSON.stringify(obj));
}

// Okurken: Timestamp → milisaniye, belge bağlantısı → yol; geri kalanı düz nesne
function plain(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v ?? null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v.path === 'string' && v.firestore) return v.path;
  const out = {};
  for (const k of Object.keys(v)) out[k] = plain(v[k]);
  return out;
}

const ms = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : null);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// Metni en çok n uzunluğa kırpar. Kurallar da tarayıcı gibi emojiyi 2 sayar; emoji ortadan bölünmez.
function clip(v, n) {
  const s = str(v).trim();
  if (s.length <= n) return s;
  let out = '';
  for (const ch of s) {
    if (out.length + ch.length > n) break;
    out += ch;
  }
  return out.trim();
}

// UTF-8 boyutu (yazma gruplarını bölmek için yaklaşık)
const encoder = new TextEncoder();
const byteSize = (data) => encoder.encode(JSON.stringify(data)).length + 300;

// Tarihi olmayanlar sona kalır; aynı anda olanlar kimliğe göre sıralanır
function byCreated(dir) {
  return (a, b) => {
    if (a.createdAt == null || b.createdAt == null) {
      if (a.createdAt != null) return -1;
      if (b.createdAt != null) return 1;
    } else if (a.createdAt !== b.createdAt) {
      return dir * (a.createdAt - b.createdAt);
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/* ---------- başlatma ---------- */

async function start(cfg) {
  const [fbApp, fbAuth, fs] = await Promise.all([
    import(`${SDK}firebase-app.js`),
    import(`${SDK}firebase-auth.js`),
    import(`${SDK}firebase-firestore.js`)
  ]);
  const {
    doc, collection, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
    onSnapshot, writeBatch, serverTimestamp, increment
  } = fs;
  const emu = cfg.firebaseEmulators || null;

  const app = fbApp.initializeApp(cfg.firebase);

  // Önbellek sayesinde liste internet yokken de açılır; IndexedDB kapalıysa (gizli sekme) sade Firestore
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: emu
        ? fs.memoryLocalCache()
        : fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
    });
  } catch (e) {
    db = fs.getFirestore(app);
  }
  if (emu && emu.firestore) {
    fs.connectFirestoreEmulator(db, emu.firestore.host || 'localhost', Number(emu.firestore.port));
  }

  // Giriş bu cihazda hatırlanır; sahip telefonda her seferinde yeniden giriş yapmaz
  let auth;
  try {
    auth = fbAuth.initializeAuth(app, {
      persistence: [fbAuth.browserLocalPersistence, fbAuth.indexedDBLocalPersistence]
    });
  } catch (e) {
    auth = fbAuth.getAuth(app);
  }
  auth.languageCode = 'tr'; // şifre sıfırlama e-postası Türkçe gelsin
  if (emu && emu.auth) fbAuth.connectAuthEmulator(auth, emu.auth, { disableWarnings: true });

  const userInfo = (u) => (u ? { uid: u.uid, email: u.email || '' } : null);

  // Sözü verilen işlevlerin hataları Error + .code olarak döner
  const safe = (fn) => async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      throw toError(e);
    }
  };

  // Canlı dinleyici: veri her değiştiğinde (önbellekten gelse de) onData çağrılır
  function listen(target, map, onData, onError) {
    return onSnapshot(
      target,
      (snap) => onData(map(snap)),
      (err) => {
        const e = toError(err);
        if (typeof onError === 'function') onError(e);
        else console.warn('Bulut dinleyicisi durdu:', e);
      }
    );
  }

  // Bekleyen sunucu saati yerine tahmini saat gösterilir (yeni öneri listede hemen yerini alsın)
  const dataOf = (d) => d.data({ serverTimestamps: 'estimate' });

  const gameRef = (id) => doc(db, 'games', checkId(id));
  const imagesOf = (gameId) => collection(db, 'games', checkId(gameId), 'images');
  const suggestionRef = (id) => doc(db, 'suggestions', checkId(id));

  // İşlemler sırayla, sınırları aşmayan gruplar halinde gönderilir
  async function commitAll(ops) {
    let batch = writeBatch(db);
    let count = 0;
    let bytes = 0;
    for (const op of ops) {
      if (count && (count >= BATCH_OPS || bytes + op.size > BATCH_BYTES)) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
        bytes = 0;
      }
      if (op.data) batch.set(op.ref, op.data);
      else batch.delete(op.ref);
      count++;
      bytes += op.size;
    }
    if (count) await batch.commit();
  }

  // Oyun belgesini galerisiyle birlikte silme işlemleri (önce görseller, sonra oyun)
  async function deleteOps(ref) {
    const images = await getDocs(collection(ref, 'images'));
    return [...images.docs.map((d) => ({ ref: d.ref, size: 300 })), { ref, size: 300 }];
  }

  function checkGame(game) {
    const data = clean(game);
    checkId(data.id);
    const c = data.cover;
    if (c != null && typeof c !== 'string') throw invalid('Kapak görseli metin olmalı');
    if (typeof c === 'string' && c.length >= LIMITS.cover) {
      throw invalid('Kapak görseli çok büyük; daha küçük bir görsel seç.');
    }
    return data;
  }

  const api = {
    enabled: true,
    projectId: String(cfg.firebase.projectId || ''),
    limits: { ...LIMITS },
    rulesFor,

    /* ---------- giriş ---------- */
    onAuthChange(cb) {
      return fbAuth.onAuthStateChanged(auth, (u) => cb(userInfo(u)));
    },
    signIn: safe(async (email, password) => {
      const res = await fbAuth.signInWithEmailAndPassword(auth, String(email ?? '').trim(), String(password ?? ''));
      return userInfo(res.user);
    }),
    signOut: safe(() => fbAuth.signOut(auth)),
    resetPassword: safe((email) => fbAuth.sendPasswordResetEmail(auth, String(email ?? '').trim())),

    /* ---------- site ayarları ---------- */
    watchSite(onData, onError) {
      return listen(doc(db, 'site', 'settings'), (s) => (s.exists() ? plain(dataOf(s)) : null), onData, onError);
    },
    saveSite: safe((site) => setDoc(doc(db, 'site', 'settings'), clean(site))),

    /* ---------- oyunlar ---------- */
    watchGames(onData, onError) {
      return listen(collection(db, 'games'), (qs) => qs.docs.map((d) => ({ ...plain(dataOf(d)), id: d.id })), onData, onError);
    },
    saveGame: safe(async (game) => {
      const data = checkGame(game);
      await setDoc(gameRef(data.id), data);
    }),
    deleteGame: safe(async (id) => {
      await commitAll(await deleteOps(gameRef(id)));
    }),
    // Bulut listesini verilen listeyle aynı yapar: hepsini yazar, listede olmayanları (galerileriyle) siler
    replaceGames: safe(async (games) => {
      if (!Array.isArray(games)) throw invalid('Oyun listesi bekleniyordu');
      const wanted = new Map();
      for (const g of games) {
        const data = checkGame(g);
        wanted.set(data.id, data);
      }
      const ops = [];
      for (const [id, data] of wanted) ops.push({ ref: gameRef(id), data, size: byteSize(data) });
      const existing = await getDocs(collection(db, 'games'));
      const removed = existing.docs.filter((d) => !wanted.has(d.id));
      for (const list of await Promise.all(removed.map((d) => deleteOps(d.ref)))) ops.push(...list);
      await commitAll(ops);
    }),

    /* ---------- galeri ---------- */
    listImages: safe(async (gameId) => {
      const qs = await getDocs(imagesOf(gameId));
      return qs.docs
        .map((d) => {
          const x = dataOf(d);
          return { id: d.id, data: str(x.data), createdAt: ms(x.createdAt) };
        })
        .sort(byCreated(1));
    }),
    addImage: safe(async (gameId, dataUrl) => {
      if (typeof dataUrl !== 'string' || !/^data:image\//i.test(dataUrl)) throw invalid('Görsel bekleniyordu');
      if (dataUrl.length >= LIMITS.image) throw invalid('Görsel çok büyük; daha küçük bir görsel seç.');
      const ref = await addDoc(imagesOf(gameId), { data: dataUrl, createdAt: serverTimestamp() });
      return ref.id;
    }),
    deleteImage: safe((gameId, imageId) => deleteDoc(doc(imagesOf(gameId), checkId(imageId)))),

    /* ---------- öneriler ---------- */
    watchSuggestions(onData, onError) {
      const map = (qs) =>
        qs.docs
          .map((d) => {
            const x = dataOf(d);
            return {
              id: d.id,
              title: str(x.title),
              note: str(x.note),
              name: str(x.name),
              category: str(x.category),
              votes: Number(x.votes) || 0,
              status: STATUSES.includes(x.status) ? x.status : 'new',
              gameId: str(x.gameId),
              createdAt: ms(x.createdAt)
            };
          })
          .sort(byCreated(-1));
      return listen(collection(db, 'suggestions'), map, onData, onError);
    },
    // Uzun yazılanlar kurallardaki sınıra kırpılır; başlık zorunlu
    addSuggestion: safe(async (s) => {
      s = s && typeof s === 'object' ? s : {};
      const title = clip(s.title, LIMITS.title);
      if (!title) throw invalid('Oyun adı boş olamaz');
      const ref = await addDoc(collection(db, 'suggestions'), {
        title,
        note: clip(s.note, LIMITS.note),
        name: clip(s.name, LIMITS.name),
        category: clip(s.category, LIMITS.category),
        votes: 0,
        status: 'new',
        createdAt: serverTimestamp()
      });
      return ref.id;
    }),
    voteSuggestion: safe((id) => updateDoc(suggestionRef(id), { votes: increment(1) })),
    // Yalnızca sahip: öneri listeye eklendi / reddedildi / yeniden "yeni"
    markSuggestion: safe(async (id, change) => {
      const { status, gameId } = change && typeof change === 'object' ? change : {};
      if (!STATUSES.includes(status)) throw invalid(`Geçersiz durum: ${String(status)}`);
      await updateDoc(suggestionRef(id), { status, gameId: str(gameId) });
    }),
    deleteSuggestion: safe((id) => deleteDoc(suggestionRef(id)))
  };
  return api;
}

const cfg = window.SITE_CONFIG;
if (!(cfg && cfg.firebase && cfg.firebase.apiKey)) {
  finish({ enabled: false });
} else {
  start(cfg).then(finish, (err) => {
    console.warn('Bulut bağlantısı kurulamadı:', err);
    finish({ enabled: false, error: String(err) });
  });
}
