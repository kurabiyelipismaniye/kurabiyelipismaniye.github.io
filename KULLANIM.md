# Oyun Arşivi — kullanım kılavuzu

YouTube kanalın için oyun listesi sitesi. Oyun ekleyebilir, oynadıklarına tik atabilir,
her oyuna açıklama, kategori, platform, puan, kapak görseli ve kanalda yayınladığın bölümleri
(YouTube linki ve yayın tarihiyle) ekleyebilirsin. Sunucu ya da veritabanı gerekmez; GitHub Pages'te ücretsiz yayınlanır.

## Sitede neler var

- **Şimdi oynuyorum:** sayfanın en üstünde, devam eden oyunlardan son bölümü en yeni olanı büyük kapağıyla,
  son bölümüyle ve “Son bölümü izle” düğmesiyle gösterir; kapağa basınca son bölüm site içinde oynar. Başka devam eden
  oyun varsa altında küçük düğmeler olarak listelenir. Devam eden oyun yoksa bu bölüm görünmez.
- **Kayıt dosyası:** kaç oyunu bitirdiğin, kaçının devam ettiği, kaçının sırada olduğu, toplam bölüm sayısı ve yüzde olarak ilerleme çubuğu
- **Arama:** oyun adı, kategori, platform, açıklama ya da bölüm başlıklarında arar
- **Filtreler:** Tümü / Oynadıklarım / Devam edenler / Sıradakiler, kategori düğmeleri, sıralama (son eklenen, son yayınlanan bölüm, A–Z, puan, son bitirilen)
- **Oyun kartları:** kapak, bölüm sayısı, kategori, platform, kısa açıklama, puan ve durum (Oynandı / Devam ediyor / Sırada)
- **Ayrıntı penceresi:** karta tıklayınca açılır. İçinde tam açıklama, bilgiler, **Kanaldaki seri** özeti
  (ilk ve son bölümün yayın tarihi, ne kadar önce yayınlandığı, kaç bölüm olduğu, serinin kaç günde
  tamamlandığı ve bölümleri tarihine göre gösteren çizgi) ve bölüm listesi var. Bölümler site içinde oynatılır.
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

## Yeni bölüm yükleyince

1. Düzenleme modunda oyunun kartına tıkla ve **Bölüm ekle**'ye bas.
2. Videonun YouTube linkini yapıştır. Tarih bugünle gelir; video başka gün yayınlandıysa değiştir.
   Başlığı boş bırakırsan bölüm “5. bölüm” gibi numarasıyla görünür (internet bağlantısı izin verirse başlık videodan kendiliğinden gelir).
3. **Değişiklikleri kaydet**, sonra herkesin görmesi için **Yayınla**.

İleri bir tarih girersen (planlanmış video ya da prömiyer) bölüm listede **Yayınlanacak** olarak, seri özetinde
**Sıradaki bölüm** olarak görünür. O gün gelince kendiliğinden yayınlanmış sayılır.

Seriyi bitirdiysen “Bu oyunu oynadım” kutusunu işaretle; bitirme tarihi olarak son bölümün tarihi önerilir.

## Değişiklikleri herkese göstermek (yayınlamak)

Düzenlemelerin önce yalnızca **senin tarayıcında** saklanır. Ziyaretçilerin görmesi için:

1. Düzenleme modunda **Yayınla / Yedekle** → **Listeyi kopyala**.
2. GitHub'da `data/games.js` dosyasını aç, sağ üstteki kalem simgesiyle düzenle.
3. İçindekilerin hepsini sil, kopyaladığını yapıştır, **Commit changes** ile kaydet.

Bir iki dakika içinde site güncellenir. Aynı penceredeki **games.js olarak indir** düğmesi yedek almak için de işe yarar;
yedeği **Dosya seç** ile geri yükleyebilirsin.

> Tarayıcı verilerini temizlersen yayınlamadığın değişiklikler silinir. Arada bir yayınla ya da yedek indir.

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

Bilgisayarında denemek için `index.html` dosyasına çift tıklaman yeterli.
