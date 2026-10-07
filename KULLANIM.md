# Oyun Arşivi — kullanım kılavuzu

YouTube kanalın için oyun listesi sitesi. Oyun ekleyebilir, oynadıklarına tik atabilir,
her oyuna açıklama, kategori, platform, puan, kapak görseli ve YouTube videosu bağlayabilirsin.
Sunucu ya da veritabanı gerekmez; GitHub Pages'te ücretsiz yayınlanır.

## Sitede neler var

- **Kayıt dosyası:** kaç oyunu bitirdiğin, yüzde olarak ilerleme çubuğu
- **Arama:** oyun adı, kategori, platform ya da açıklamada arar
- **Filtreler:** Tümü / Oynadıklarım / Sıradakiler, kategori düğmeleri, sıralama (son eklenen, A–Z, puan, son bitirilen)
- **Oyun kartları:** kapak, kategori, platform, kısa açıklama, puan ve “Oynandı” damgası
- **Ayrıntı penceresi:** karta tıklayınca açılır; tam açıklama, bilgiler ve video (site içinde oynatılır)
- Açık ve koyu tema, telefonda da düzgün görünür

## Düzenleme

1. Sağ üstteki **Düzenle** (kalem) düğmesine bas. Adresin sonuna `#duzenle` yazarak da açabilirsin.
2. Sarı çizgili çubuk çıkar:
   - **Oyun ekle:** ad ve kategori zorunlu; platform, açıklama, YouTube video linki, kapak görseli, puan ve “Bu oyunu oynadım” isteğe bağlı.
   - **Site ayarları:** kanal adı, başlık, kısa açıklama, YouTube kanal linki (doldurunca kırmızı “Abone ol” düğmesi çıkar).
   - **Yayınla / Yedekle:** aşağıya bak.
3. Kartlardaki **Oynadım** kutusuna tıklayınca oyun bitti olarak işaretlenir ve bugünün tarihi kaydedilir.
   Kalem simgesi oyunu düzenler; silme düğmesi düzenleme penceresinin içindedir (silince “Geri al” çıkar).
4. İşin bitince **Bitti**'ye bas; site ziyaretçilerin gördüğü hâline döner.

> `data/games.js` içindeki 10 oyun örnek olarak eklendi. Düzenleme modunda silebilir ya da değiştirebilirsin.

## Değişiklikleri herkese göstermek (yayınlamak)

Düzenlemelerin önce yalnızca **senin tarayıcında** saklanır. Ziyaretçilerin görmesi için:

1. Düzenleme modunda **Yayınla / Yedekle** → **Listeyi kopyala**.
2. GitHub'da `data/games.js` dosyasını aç, sağ üstteki kalem simgesiyle düzenle.
3. İçindekilerin hepsini sil, kopyaladığını yapıştır, **Commit changes** ile kaydet.

Bir iki dakika içinde site güncellenir. Aynı penceredeki **games.js olarak indir** düğmesi yedek almak için de işe yarar;
yedeği **Dosya seç** ile geri yükleyebilirsin.

> Tarayıcı verilerini temizlersen yayınlamadığın değişiklikler silinir. Arada bir yayınla ya da yedek indir.

## Siteyi GitHub Pages'te yayına almak

1. GitHub'da bu deponun **Settings → Pages** sayfasına git.
2. **Source:** “Deploy from a branch”. **Branch:** sitenin bulunduğu dal (ör. `main`), klasör `/ (root)` → **Save**.
3. Birkaç dakika sonra site `https://ibrahimeserocak.github.io/ibrahimeserocak/` adresinde açılır.

Dalın adı `main` değilse “Site ayarları”ndaki **GitHub'daki veri dosyasının düzenleme linki** alanını
o dala göre güncelle (ör. `.../edit/DAL-ADI/data/games.js`).

## Kapak görselleri

- **Hiçbir şey koymazsan:** oyunun adıyla renkli bir kapak çizilir.
- **YouTube video linki eklersen:** videonun küçük resmi kapak olur.
- **Görsel linki:** internetteki bir görselin `https://` adresini yapıştır.
- **Bilgisayardan yükle:** görsel küçültülüp listeye gömülür. Çok sayıda yüklenen görsel listeyi büyütür;
  istersen görselleri depoda `images/` klasörüne koyup kapak alanına `images/dosya-adi.jpg` yazabilirsin.

## Dosyalar

| Dosya | Ne işe yarar |
| --- | --- |
| `index.html` | Sayfanın iskeleti |
| `css/style.css` | Görünüm, renkler, yazı tipleri |
| `js/app.js` | Ekleme, tik atma, filtreleme, yayınlama |
| `data/games.js` | Oyun listesi ve site ayarları (yayınladığın dosya) |

Bilgisayarında denemek için `index.html` dosyasına çift tıklaman yeterli.
