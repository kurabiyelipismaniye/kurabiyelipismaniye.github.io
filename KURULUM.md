# Kurulum: siteyi buluta bağlamak (Firebase)

Bu kurulumdan sonra:

- GitHub'da dosya düzenlemen gerekmez. Sitede **Giriş** yaparsın, değiştirirsin, otomatik kaydedilir, herkes hemen görür.
- Oyunlara telefonundan dokunarak görsel eklersin.
- Ziyaretçiler **Öneriler** sekmesinden oyun önerir; sen bir dokunuşla listene eklersin.
- Kanalın (Kurabiyeli Pişmaniye) son videosu sitede görünür.
- Liste her saat GitHub'a yedeklenir.

Süre: 20–30 dakika. Hepsi Android telefondan, Chrome ile yapılabilir. Ücretsizdir, kart bilgisi gerekmez.

## Başlamadan önce

- **Google hesabı:** Firebase'e bununla girersin.
- **GitHub hesabı:** yalnızca ayarları kendin yapıştıracaksan ve son videoyu elle getirmek istersen lazım.
- **Masaüstü görünümü:** Firebase ve GitHub telefonda sıkışık görünebilir. Chrome'da sağ üstteki **⋮** menüsünden
  **Masaüstü sitesi** kutusunu işaretle (İngilizce menüde “Desktop site”). Telefonu yan çevirmek de işe yarar.
- **Dil:** Firebase konsolu çoğunlukla İngilizce görünür. Aşağıda düğme adlarını İngilizce ve tırnak içinde yazdım, yanında ne işe yaradığını.
  Firebase menülerin yerini ara sıra değiştiriyor; iki ad verdiğim yerlerde hangisini görüyorsan onu seç.

## Yol haritası

1. Firebase projesi aç
2. Web uygulaması ekle, ayarları Claude'a gönder
3. E-posta/şifre ile girişi aç
4. Kendini kullanıcı olarak ekle
5. Firestore veritabanını oluştur
6. Sitede giriş yap, güvenlik kurallarını yayınla
7. **Listeyi buluta aktar**
8. YouTube kanal linkini gir

---

## 1. Firebase projesini oluştur

1. Chrome'da [console.firebase.google.com](https://console.firebase.google.com/) adresini aç, Google hesabınla gir.
2. **“Create a new Firebase project”** düğmesine bas (yeni proje; bazen “Create a project” ya da “Add project” yazar).
3. Proje adı yaz, ör. `kurabiyeli-pismaniye`. Türkçe karakter kullanma. Altında çıkan proje kimliğini (project ID) değiştirmene gerek yok.
4. Şartları kabul et, **“Continue”**.
5. Yapay zekâ yardımı (“Gemini in Firebase”) sorulursa açık ya da kapalı fark etmez.
6. **Google Analytics** sorulursa **kapat**. Bu site kullanmıyor.
7. **“Create project”**, bitince **“Continue”**.

Proje ücretsiz **Spark** planında açılır. “Upgrade” ya da “Blaze” (kartlı plan) önerisi görürsen geç; gerek yok.

## 2. Web uygulaması ekle ve ayarları gönder

1. Projenin ana sayfasında (“Project Overview”) **`</>`** (Web) simgesine dokun.
   Görmüyorsan **“+ Add app”** → Web.
2. **“App nickname”** (uygulamaya takma ad): ör. `Oyun Arşivi`.
3. **“Also set up Firebase Hosting for this app”** kutusunu **işaretleme**. Site zaten GitHub Pages'te.
4. **“Register app”** (uygulamayı kaydet).
5. Ekranda `const firebaseConfig = {` ile başlayan bir kod çıkar. İçinde `apiKey`, `authDomain`, `projectId`,
   `storageBucket`, `messagingSenderId`, `appId` satırları var. `{` işaretinden `}` işaretine kadar olan kısmı kopyala.
6. **“Continue to console”** (konsola dön).

> Bu bilgiler gizli değildir; sitenin kodunda herkes görebilir. Güvenliği 6. adımdaki kurallar sağlar.
>
> Sonradan bulmak için: sol üstteki **⚙ (dişli)** → **“Project settings”** → **“General”** sekmesi → aşağıda **“Your apps”** →
> uygulamanı seç → **“Config”** seçeneği.

### Ayarları siteye koy (iki yoldan biri)

**A) Claude'a gönder (en kolayı).** Kopyaladığın kodu sohbete yapıştır ve “Bunu sitenin ayarlarına ekle” yaz.
Claude `js/config.js` dosyasına ekleyip yayınlar.

**B) GitHub'da kendin düzenle.**

1. Chrome'da GitHub'a giriş yap ve **Masaüstü sitesi**ni aç.
2. Şu adresi aç: `https://github.com/kurabiyelipismaniye/kurabiyelipismaniye.github.io/edit/main/js/config.js`
   (dosya düzenleyicisi doğrudan açılır; açılmazsa dosyayı açıp kalem simgesine bas).
3. `firebase: null,` satırını bul. `null` yerine kopyaladığın `{ ... }` kısmını yapıştır. Sonunda virgül kalsın:

   ```js
     firebase: {
       apiKey: "AIza…",
       authDomain: "kurabiyeli-pismaniye.firebaseapp.com",
       projectId: "kurabiyeli-pismaniye",
       storageBucket: "kurabiyeli-pismaniye.firebasestorage.app",
       messagingSenderId: "123456789",
       appId: "1:123456789:web:abc123"
     },
   ```

   `const firebaseConfig =` kısmını ve sondaki `;` işaretini yapıştırma. `measurementId` satırı da varsa sorun değil.
4. Sağ üstte **“Commit changes…”** → açılan pencerede **“Commit directly to the main branch”** seçili kalsın → yeşil **“Commit changes”**.

Birkaç dakika (en fazla ~10) sonra siteyi yenile. Sağ üstteki düğme **Düzenle** yerine **Giriş** olduysa bağlantı tamam.

## 3. E-posta/şifre ile girişi aç

1. Firebase'de sol menüyü aç (telefonda **☰**). **“Security” → “Authentication”** (bazı ekranlarda **“Build” → “Authentication”**).
2. İlk kez açıyorsan **“Get started”** (başla).
3. **“Sign-in method”** (giriş yöntemleri) sekmesi → **“Email/Password”**.
4. İlk anahtarı (**“Enable”**) aç. Altındaki “Email link (passwordless sign-in)” kapalı kalsın.
5. **“Save”** (kaydet).

## 4. Kendini kullanıcı olarak ekle

1. Aynı yerde **“Users”** (kullanıcılar) sekmesi → **“Add user”**.
2. Kendi e-posta adresini ve bir şifre yaz (en az 6 karakter) → **“Add user”**.

Bu e-posta sitenin sahibi olarak kurallara yazılacak. Gerçekten kullandığın bir adres olsun; şifre sıfırlama e-postası oraya gelir.
Sitede “kayıt ol” yok; ziyaretçiler hesap açmaz.

**Güvenlik için bir ayar daha:** Authentication → **“Settings”** sekmesi → **“User actions”** bölümünde
**“Enable create (sign-up)”** kutusunun işaretini kaldır → **Save**. Böylece Firebase'in kendi adresi üzerinden de
kimse yeni hesap açamaz; yalnızca senin konsoldan eklediğin hesap kalır. (Bu bölümün adı biraz farklı görünürse
“sign-up” ya da “create” geçen ayarı ara.)

## 5. Firestore veritabanını oluştur

1. Sol menü → **“Databases & Storage” → “Firestore”** (bazı ekranlarda **“Build” → “Firestore Database”**).
2. **“Create database”** (veritabanı oluştur).
3. Sürüm sorulursa **“Standard edition”** → **“Next”**.
4. **“Database ID”** sorulursa `(default)` olarak bırak. Değiştirme; site bu adı arar.
5. Konum (“Location”): **`eur3 (europe-west)`** önerilir (Avrupa'da birden çok bölge, Türkiye'ye yakın). Yazılışı biraz farklı olabilir;
   `eur3` geçeni seç. Yoksa `europe-west` ile başlayan bir bölge de olur. **Konum sonradan değiştirilemez.**
6. Başlangıç kuralları için **“Production mode”** (üretim modu) seç → **“Create”**.
   - “Test mode” seçme: bir süre herkesin her şeyi silebileceği bir veritabanı açar.
   - Production mode başta her şeyi kapatır. Doğru kuralları bir sonraki adımda siteden alacaksın.

> **Storage**'a (Cloud Storage) dokunma. Artık kartlı Blaze planı istiyor. Bu site görselleri küçültüp Firestore'da sakladığı için Storage'a gerek yok.

## 6. Sitede giriş yap ve güvenlik kurallarını yayınla

1. Siteyi aç: [kurabiyelipismaniye.github.io](https://kurabiyelipismaniye.github.io/) → sağ üstte **Giriş**.
2. Dördüncü adımda eklediğin e-postayı ve şifreyi yaz → **Giriş yap**.
3. **Kurulum** penceresi kendiliğinden açılır. Açılmazsa düzenleme çubuğundaki **Kurulum** düğmesine bas
   (ya da adresin sonuna `#kurulum` yaz).
4. “Güvenlik kuralları” adımında **Kuralları kopyala**'ya bas. Kurallar sana özeldir; içinde senin e-postan yazılıdır.
5. **Kurallar sayfasını aç** düğmesi Firebase'de doğru sayfayı açar. (Elle: Firestore → **“Rules”** sekmesi.)
6. Düzenleyicideki yazının hepsini sil: içine dokun, uzun bas → **Tümünü seç** → sil. Sonra uzun bas → **Yapıştır**.
7. **“Publish”** (yayınla).
8. Siteye dön → **Yayınladım, kontrol et**. Kuralların işlemesi bir dakikayı bulabilir; olmazsa biraz bekleyip tekrar bas.

## 7. Listeyi buluta aktar

1. Kurulum penceresinde **Listeyi buluta aktar**'a bas.
2. Sitedeki liste, site ayarları ve bu tarayıcıda yaptığın (yayınlamadığın) düzenlemeler buluta yüklenir.

- Daha önce başka bir telefonda ya da bilgisayarda düzenleme yapıp yayınlamadıysan, bu adımı **o tarayıcıdan** yap.
- Listede siteyle gelen örnek oyunlar varsa **Örnekleri sil** ile kaldırabilirsin.
- Bundan sonra `data/games.js` dosyasını GitHub'da elle düzenleme. Saatlik görev onu buluttaki listeyle değiştirir.

## 8. YouTube kanal linki (son video)

Kanal linkin (`https://www.youtube.com/@kurabiyelipismaniye`) siteye zaten eklendi; listeyi buluta aktarınca o da
gider, bu adım çoğunlukla kendiliğinden tamamlanmış olur. Değiştirmek istersen:

1. Düzenleme çubuğunda **Site ayarları**.
2. **Kanal adı**: `Kurabiyeli Pişmaniye` (hazır gelir).
3. **YouTube kanal linki**: kanalının adresi → **Kaydet**.

“Abone ol” düğmesi hemen çıkar. Son video en geç bir saat içinde sitenin üstünde görünür. Yeni video yükleyince de en geç bir saatte güncellenir.

**Hemen görmek istersen (isteğe bağlı):**

1. Chrome'da GitHub'a giriş yap, **Masaüstü sitesi**ni aç: `https://github.com/kurabiyelipismaniye/kurabiyelipismaniye.github.io/actions`
2. Solda **Son videolar ve yedek**.
3. **“Run workflow”** → dal `main` kalsın → yeşil **“Run workflow”**.
4. 1–2 dakika sonra yeşil tik çıkınca siteyi yenile.

Kurulum bitti. Kurulum penceresinde bütün adımlar tikliyse her şey çalışıyor.

---

## Kim ne yapabilir

| | Ziyaretçi | Sen (giriş yapınca) |
| --- | :---: | :---: |
| Listeyi, bölümleri, görselleri, son videoyu görmek | ✓ | ✓ |
| Aramak, filtrelemek, bölümleri izlemek | ✓ | ✓ |
| **Öneriler** sekmesinde oyun önermek | ✓ | ✓ |
| Bir öneriye oy vermek (öneri başına bir oy) | ✓ | ✓ |
| Oyun eklemek, düzenlemek, silmek, tik atmak | — | ✓ |
| Görsel eklemek ve silmek | — | ✓ |
| Öneriyi **Listeme ekle**, öneri silmek | — | ✓ |
| **Site ayarları**, **Kurulum**, yedek indirmek | — | ✓ |

Ziyaretçiler giriş yapmaz. Başka biri Firebase'de hesap açsa bile kurallar yalnızca senin e-postana yazma izni verir.

## Ne herkese açık, ne gizli

- **Açık:** oyunlar, bölümler, görseller, site ayarları, öneriler (önerenin yazdığı ad dahil) ve oy sayıları.
  GitHub deposu da açık; içindeki yedek dosyası da herkesçe görülebilir. Zaten sitede görünen bilgilerdir.
- **Gizli:** şifren, Firebase konsolu (yalnızca senin Google hesabın), e-posta adresin (yalnızca Firebase'deki kurallarda yazılı).
- `firebaseConfig` bilgileri gizli değildir; sorun yok.

## Ücretsiz plan (Spark) sınırları

Kart girmediğin için **asla ücret çıkmaz**. Sınır dolarsa o gün o özellik durur, ertesi gün kendiliğinden açılır.

| Ne | Günlük / toplam sınır | Ne anlama geliyor |
| --- | --- | --- |
| Kayıt alanı | toplam 1 GB | Oyunlar, öneriler ve görseller. Küçültülmüş bir fotoğraf genelde birkaç yüz KB; kabaca birkaç bin fotoğraf sığar. |
| Okuma | günde 50.000 | Bir ziyaretçi siteyi açınca her oyun ve her öneri 1 okuma sayılır (galeriyi açınca görseller de). 100 oyun + 50 öneriyle günde yaklaşık 300 ziyaret. Liste büyüdükçe bu sayı azalır. |
| Yazma / silme | günde 20.000 / 20.000 | Senin düzenlemelerin, öneriler ve oylar. Fazlasıyla yeter. |
| Veri çıkışı | ayda 10 GB | Çoğunu görseller harcar. |
| Giriş (Authentication) | — | Tek kullanıcı sensin; sorun olmaz. Günde 150 şifre sıfırlama e-postası gönderilebilir. |

- Günlük sınırlar ABD Pasifik saatiyle gece yarısı, yani **Türkiye saatiyle sabah 10–11 civarı** sıfırlanır.
- Okuma sınırı dolarsa ziyaretçiler listenin GitHub'daki son saatlik kopyasını görür. Okuma ve yazma ayrı sayıldığı için kaydetmek ve öneri göndermek çoğunlukla çalışmaya devam eder, ama değişiklikler o gün sitede görünmeyebilir.
- Kullanımı görmek için: Firebase'de Firestore sayfasındaki **“Usage”** (kullanım) sekmesi.

## Yedekler

- **Otomatik:** GitHub'daki görev her saat buluttaki her şeyi (oyunlar, görseller, ayarlar, öneriler) `backup/firestore-backup.json` dosyasına yazar.
  Aynı anda `data/games.js` dosyasını da günceller (Firebase'e ulaşılamazsa site bunu gösterir; yüklediğin kapak görselleri bu kopyada yoktur).
- Yalnızca değişiklik varsa kaydeder. GitHub her eski hâli saklar: dosyayı aç → **“History”** (saat simgesi).
- **Elle:** düzenleme çubuğunda **Yedekle** → **Yedeği indir** (görseller hariç tek dosya).
- **Geri dönmek:** sildiğin bir şey için önce hemen çıkan **Geri al**'a bas. Daha eski bir hâle dönmek için Claude'a
  “backup/firestore-backup.json dosyasının şu tarihteki hâlini geri yükle” de.

## Şifreni unutursan

1. Sitede **Giriş** → e-posta adresini yaz → **Şifremi unuttum**.
2. Gelen e-postadaki linkten yeni şifreni belirle. Gelmezse spam klasörüne bak; adresin 4. adımdakiyle aynı olmalı.

Başka yol: Firebase → Authentication → **“Users”** → kendi satırındaki **⋮** menüsünden şifre sıfırlama.

## Sorun giderme

| Ne görüyorsun | Ne yapmalı |
| --- | --- |
| Sağ üstte hâlâ **Düzenle** yazıyor, **Giriş** yok | `js/config.js` ayarı yayınlanmamış ya da hatalı. GitHub Pages'in güncellemesi ve tarayıcı önbelleği yüzünden 10 dakikaya kadar sürebilir; bekleyip sayfayı yenile. Düzelmezse ayarları Claude'a gönder. |
| “E-posta ya da şifre yanlış.” | Yazımı kontrol et. Firebase → Authentication → “Users” listesinde adresin var mı bak. Gerekirse **Şifremi unuttum**. |
| “Giriş yapılamadı (auth/operation-not-allowed)” | 3. adım eksik: “Email/Password” açılmamış. |
| “Çok fazla deneme yapıldı.” | Birkaç dakika bekle. |
| “Firestore veritabanı henüz oluşturulmamış” | 5. adımı yap, sonra **Tekrar kontrol et**. |
| “Kurulum tamamlanmadı”, “yetki yok” ya da permission-denied | Kurallar yayınlanmamış, eksik yapıştırılmış ya da başka bir e-postayla giriş yapılmış. **Kurulum** → **Kuralları kopyala** → Rules'ta her şeyi silip yapıştır → **“Publish”** → 1 dakika bekle → **Yayınladım, kontrol et**. |
| Giriş e-postanı değiştirdin | Yeni e-postayla giriş yap; **Kurulum** yeni kuralları gösterir. Onları yayınla. |
| “günlük ücretsiz kullanım sınırı dolmuş olabilir” | Türkiye saatiyle sabah 10–11'de sıfırlanır. Bekle. |
| “veri çok büyük” (görsel eklerken) | Daha küçük bir fotoğraf seç ya da ekran görüntüsü kullan. |
| Son video görünmüyor | **Site ayarları**'nda kanal linki dolu mu ve `https://www.youtube.com/@…` biçiminde mi bak. Bir saat bekle ya da “Run workflow” ile hemen çalıştır. GitHub → **Actions**'ta kırmızı ✗ varsa Claude'a haber ver. |
| Actions'ta “permission denied” / 403 hatası | GitHub → depo → **“Settings” → “Actions” → “General”** → **“Workflow permissions”** → **“Read and write permissions”** → **“Save”**. |
| Son video ve yedek güncellenmeyi bıraktı | GitHub, 60 gün hiç değişiklik olmayan açık depolarda saatlik görevi kapatır. **Actions** → **Son videolar ve yedek** → üstteki uyarıdaki **“Enable workflow”** → sonra **“Run workflow”**. Siteyi düzenli kullandıkça bu olmaz. |
| Değişikliklerim başka telefonda görünmüyor | Sayfayı yenile. İnternet yokken yaptığın değişiklikler bağlantı gelince gönderilir. |

## Kurulumdan sonra kısaca

- **Düzenlemek:** **Giriş** yap; düzenleme modu açılır. Her değişiklik kendiliğinden kaydedilir. Telefonda bir kez giriş yapınca açık kalır; çıkmak için **Çıkış**.
- **Görsel eklemek:** oyunun kartına dokun → **Görsel ekle** → galeriden fotoğraf seç. Görsel küçültülüp kaydedilir.
- **Öneriler:** **Öneriler** sekmesinde, listende olmayan önerilerin altında **Listeme ekle** düğmesi var (oyun zaten listedeyse **Listede var, işaretle** çıkar).
- Ayrıntılar için [KULLANIM.md](KULLANIM.md).
