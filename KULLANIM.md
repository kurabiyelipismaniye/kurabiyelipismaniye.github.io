# Oyun Arşivi — kullanım kılavuzu

YouTube kanalın için oyun listesi sitesi. Oyun ekleyebilir, oynadıklarına tik atabilir,
her oyuna açıklama, kategori, platform, puan, kapak görseli ve kanalda yayınladığın bölümleri
(YouTube linki ve yayın tarihiyle) ekleyebilirsin. Sunucu ya da veritabanı gerekmez; GitHub Pages'te ücretsiz yayınlanır.

## Sitede neler var

- **Şimdi oynuyorum:** sayfanın en üstünde, devam eden oyunlardan son bölümü en yeni olanı büyük kapağıyla,
  son bölümüyle ve “Son bölümü izle” düğmesiyle gösterir; kapağa basınca son bölüm site içinde oynar. Başka devam eden
  oyun varsa altında küçük düğmeler olarak listelenir. Devam eden oyun yoksa bu bölüm görünmez.
- **Yakında:** ileri tarihli (henüz yayınlanmamış) bölümlerin hepsini tarihe göre sıralar: gün, ay, haftanın günü,
  “yarın / 3 gün sonra”, oyunun adı ve bölümü. İlk 4'ü görünür, fazlası “Tümünü göster” ile açılır. Bölümün linki varsa
  yanındaki simgeyle açılır (ör. YouTube prömiyer sayfası). İleri tarihli bölüm yoksa bu bölüm görünmez.
- **Kayıt dosyası:** kaç oyunu bitirdiğin, kaçının devam ettiği, kaçının sırada olduğu, toplam bölüm sayısı ve yüzde olarak ilerleme çubuğu
- **İstatistikler:** “Kayıt dosyası” kartındaki **İstatistikler** bağlantısı (ya da adresin sonuna `#istatistik`):
  toplam video süresi, yayınlanan bölüm, bitirilen oyun, ortalama bölüm süresi; oyunlara göre toplam süre, son 12 ayda
  yayınlanan bölümler ve kategorilere göre oyunlar. Video süreleri saatlik görevle YouTube'dan okunur; yeni bölümün süresi
  en geç bir saat içinde eklenir. Oyunun penceresinde de **Toplam süre** yazar.
- **Arama:** oyun adı, kategori, platform, açıklama ya da bölüm başlıklarında arar
- **Filtreler:** Tümü / Oynadıklarım / Devam edenler / Sıradakiler, kategori düğmeleri, sıralama (son eklenen, son yayınlanan bölüm, A–Z, puan, son bitirilen)
- **Oyun kartları:** kapak, bölüm sayısı, kategori, platform, kısa açıklama, puan ve durum (Oynandı / Devam ediyor / Sırada)
- **Ayrıntı penceresi:** karta tıklayınca açılır. İçinde tam açıklama, bilgiler, **Kanaldaki seri** özeti
  (ilk ve son bölümün yayın tarihi, ne kadar önce yayınlandığı, kaç bölüm olduğu, serinin kaç günde
  tamamlandığı ve bölümleri tarihine göre gösteren çizgi) ve bölüm listesi var. Bölümler site içinde oynatılır.
- **Oyunun kendi linki:** her oyunun ayrı bir adresi var (ör. `https://kurabiyelipismaniye.github.io/#oyun/elden-ring`).
  Bu linke tıklayan, siteyi o oyunun penceresi açık hâlde görür. Linki oyunun penceresindeki **Linki kopyala** ile
  alıp video açıklamasına yapıştırabilirsin; pencere açıkken adres çubuğunda da yazar. Link oyunun kimliğinden
  oluşur; oyunun adını sonradan değiştirsen de çalışmaya devam eder.
- **Sıradaki ne olsun? çarkı:** başlığın altındaki sarı düğme (ya da adresin sonuna `#cark`). Sırada bekleyen
  oyunlardan birini dönen bir çarkla rastgele seçer; istersen devam edenleri de çarka katabilir, tek tek oyun çıkarabilirsin.
  Sesli (sağ üstten kapatılabilir), yayında doğrudan kullanılabilir. Sonuçtan **Oyunu aç** ya da **Çarktan çıkar, tekrar çevir**.
- **Steam'de gör:** oyunun Steam mağaza sayfası varsa penceresinde bu düğme çıkar (aşağıda “Steam sayfası”na bak).
- Açık ve koyu tema, telefonda da düzgün görünür

## Oyunun durumu nasıl belirlenir

Durumu elle seçmen gerekmez:

- **Oynandı:** “Oynadım” kutusu işaretli
- **Devam ediyor:** en az bir bölümü yayınlanmış ama “Oynadım” işaretli değil
- **Sırada:** henüz yayınlanmış bölümü yok

## Düzenleme

1. Sağ üstteki **Düzenle** (kalem) düğmesine bas. Adresin sonuna `#duzenle` yazarak da açabilirsin.
2. Sarı çizgili çubuk çıkar:
   - **Oyun ekle:** ad ve kategori zorunlu. Platform, açıklama, bölümler, kapak görseli, puan ve “Bu oyunu oynadım” isteğe bağlı.
   - **Site ayarları:** kanal adı, başlık, kısa açıklama, YouTube kanal linki (doldurunca kırmızı “Abone ol” düğmesi çıkar).
   - **Yayınla / Yedekle:** aşağıya bak.
   - **Örnekleri sil:** siteyle birlikte gelen “Örnek” etiketli oyunları tek seferde siler (“Geri al” ile geri getirebilirsin).
3. Kartlardaki **Oynadım** kutusuna tıklayınca oyun bitti olarak işaretlenir ve bugünün tarihi kaydedilir.
   Kalem simgesi oyunu düzenler; silme düğmesi düzenleme penceresinin içindedir (silince “Geri al” çıkar).
4. İşin bitince **Bitti**'ye bas; site ziyaretçilerin gördüğü hâline döner.

> `data/games.js` içindeki 10 oyun ve bölümleri örnek olarak eklendi. **Örnekleri sil** ile hepsini kaldırabilir
> ya da birini düzenleyip kendi bilgilerinle kaydedebilirsin (kaydedince “Örnek” etiketi kalkar).

**Oynama sırası:** düzenleme modunda **Sırayı düzenle**'ye bas; “Sırada” olan oyunları tutamaçtan (⋮⋮) sürükleyerek
(telefonda parmakla) ya da oklarla sırala ve **Sırayı kaydet**. Kartlarda “1. sırada”, “2. sırada” diye görünür;
ziyaretçiler sıralama menüsünden **Oynama sırası**'nı seçerek listeyi bu sırayla görebilir (önce devam edenler,
sonra sıradakiler, en sonda bitenler). Yeni eklenen oyun, sıralanana kadar listenin sonunda bekler.

## Yeni bölüm yükleyince

1. Düzenleme modunda oyunun kartına tıkla ve **Bölüm ekle**'ye bas.
2. Videonun YouTube linkini yapıştır. Tarih bugünle gelir; video başka gün yayınlandıysa değiştir.
   Başlığı boş bırakırsan bölüm “5. bölüm” gibi numarasıyla görünür (internet bağlantısı izin verirse başlık videodan kendiliğinden gelir).
3. **Değişiklikleri kaydet**, sonra herkesin görmesi için **Yayınla**.

**Daha kısa yol:** düzenleme modunda sayfanın üstünde **Kanalda bölüme eklenmemiş videolar** kutusu çıkar. Kanalın son
videolarından henüz hiçbir oyuna eklenmemiş olanları gösterir ve her birinin hangi oyuna ait olduğunu başlığından tahmin eder
(ör. “… | Yes, Your Grace #3” → Yes, Your Grace; “#fearstofathom” → Fears To Fathom). Tahmin doğruysa
**Bölüm olarak ekle**'ye basman yeter; link, başlık ve tarih kendiliğinden dolar. Tahmin yoksa ya da yanlışsa listeden oyunu
seç. Bölüm olmayacak videolar (ör. Shorts) için **Yoksay**. Yeni videolar saatlik görevle en geç bir saat içinde gelir.

İleri bir tarih girersen (planlanmış video ya da prömiyer) bölüm listede **Yayınlanacak** olarak, seri özetinde
**Sıradaki bölüm** olarak, sayfanın üstündeki **Yakında** listesinde de tarihiyle görünür. O gün gelince kendiliğinden yayınlanmış sayılır.

Seriyi bitirdiysen “Bu oyunu oynadım” kutusunu işaretle; bitirme tarihi olarak son bölümün tarihi önerilir.

## Steam sayfası

Oyunun Steam mağaza sayfasını elle bulman gerekmez: saatlik otomatik görev her oyunu adıyla Steam'de arar.
Yalnızca adı birebir tutan oyunu kabul eder (büyük/küçük harf, ™ ® işaretleri ve noktalama fark etmez); emin olamazsa
link koymaz. Örneğin “Minecraft” araması Steam'de “Minecraft Dungeons” bulur ama ad tutmadığı için bağlanmaz.
Yeni eklediğin oyunun düğmesi en geç bir saat içinde gelir (hemen görmek için Actions → **Son videolar ve yedek** → **Run workflow**).

Oyun formundaki **Steam sayfası** alanı:

- **Boş:** otomatik bulunan sayfa kullanılır. Alanın altında ne bulunduğu yazar.
- **Link:** otomatik bulunan yanlışsa ya da ad farklıysa (ör. “Dark Souls 3” ↔ “DARK SOULS III”) doğru linki yapıştır.
  Steam dışı bir mağaza linki de olur; düğme o zaman **Mağaza sayfası** diye görünür.
- **yok:** oyun Steam'de değilse (ör. konsol oyunu) yaz; düğme gösterilmez.

Oyunun adını değiştirirsen eski eşleşme bırakılır ve yeni adla yeniden aranır.

## Değişiklikleri herkese göstermek (yayınlamak)

Düzenlemelerin önce yalnızca **senin tarayıcında** saklanır. Ziyaretçilerin görmesi için:

1. Düzenleme modunda **Yayınla / Yedekle** → **Listeyi kopyala**.
2. GitHub'da `data/games.js` dosyasını aç, sağ üstteki kalem simgesiyle düzenle.
3. İçindekilerin hepsini sil, kopyaladığını yapıştır, **Commit changes** ile kaydet.

Bir iki dakika içinde site güncellenir. Aynı penceredeki **games.js olarak indir** düğmesi yedek almak için de işe yarar;
yedeği **Dosya seç** ile geri yükleyebilirsin.

> Tarayıcı verilerini temizlersen yayınlamadığın değişiklikler silinir. Arada bir yayınla ya da yedek indir.

## Telefona uygulama olarak eklemek

Site telefonda uygulama gibi ana ekrana eklenebilir; kendi simgesiyle, tarayıcı çubuğu olmadan açılır.
İnternet yokken de en son açılan hâli görünür.

- **Android (Chrome):** sayfanın altında **Uygulama olarak yükle** düğmesi çıkar; ya da sağ üstteki ⋮ menüsünden
  **Uygulamayı yükle / Ana ekrana ekle**.
- **iPhone (Safari):** alttaki Paylaş düğmesi → **Ana Ekrana Ekle**.
- **Bilgisayar (Chrome/Edge):** adres çubuğunun sağındaki yükle simgesi ya da sayfanın altındaki düğme.

Siteye yaptığın değişiklikler uygulamada da hemen görünür; internet varken her zaman güncel hâli açılır.

## Link paylaşınca çıkan kart

Sitenin linki WhatsApp, Discord, X gibi yerlerde paylaşılınca kapaklı bir kart çıkar (`icons/og-image.jpg`).
Site başka bir adrese taşınırsa `index.html`'in başındaki `https://kurabiyelipismaniye.github.io/` adreslerini
yenisiyle değiştirmek gerekir.

## Siteyi GitHub Pages'te yayına almak

1. GitHub'da bu deponun (`kurabiyelipismaniye/kurabiyelipismaniye.github.io`) **Settings → Pages** sayfasına git.
2. **Source:** “Deploy from a branch”. **Branch:** `main`, klasör `/ (root)` → **Save**.
3. Birkaç dakika sonra site `https://kurabiyelipismaniye.github.io/` adresinde açılır.

Siteyi başka bir depoya ya da dala taşırsan “Site ayarları”ndaki **GitHub'daki veri dosyasının düzenleme linki**
alanını da ona göre güncelle (ör. `https://github.com/KULLANICI/DEPO/edit/DAL/data/games.js`).

## Kapak görselleri

- **Hiçbir şey koymazsan:** ilk bölümün YouTube küçük resmi kapak olur; bölüm yoksa oyunun adıyla renkli bir kapak çizilir.
- **Görsel linki:** internetteki bir görselin `https://` adresini yapıştır.
- **Bilgisayardan yükle:** görsel küçültülüp listeye gömülür. Çok sayıda yüklenen görsel listeyi büyütür;
  istersen görselleri depoda `images/` klasörüne koyup kapak alanına `images/dosya-adi.jpg` yazabilirsin.

## Dosyalar

| Dosya | Ne işe yarar |
| --- | --- |
| `index.html` | Sayfanın iskeleti |
| `css/style.css` | Görünüm, renkler, yazı tipleri |
| `js/app.js` | Ekleme, tik atma, bölümler, filtreleme, yayınlama |
| `data/games.js` | Oyun listesi, bölümler ve site ayarları (yayınladığın dosya) |
| `icons/`, `favicon.ico`, `apple-touch-icon.png` | Site simgesi, uygulama simgeleri ve paylaşım kartı görseli |
| `manifest.webmanifest`, `sw.js` | Telefona uygulama olarak ekleme ve internetsizken son kopyayı açma |
| `data/durations.json` | Bölüm videolarının süreleri (saatlik görev yazar, istatistikler için) |
| `data/steam.json` | Oyunların otomatik bulunan Steam sayfaları (saatlik görev yazar, elle düzenleme) |

Bilgisayarında denemek için `index.html` dosyasına çift tıklaman yeterli.
