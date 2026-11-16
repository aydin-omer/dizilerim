# Dizilerim 📺

İzlediğim dizileri takip ettiğim kişisel bir iPhone uygulaması (PWA).
Asıl amaç: bir uygulamanın fikirden yayına nasıl geldiğini öğrenmek.

## Telefona kurulum

1. Yayın linkini iPhone'da **Safari** ile aç.
2. **Paylaş** → **Ana Ekrana Ekle**.
3. Uygulamayı artık ana ekrandaki ikondan aç.

> Not: Ana ekrandaki uygulama ile Safari'deki sayfa **ayrı** veri saklar.
> Dizilerini ana ekran uygulamasının içinden ekle.

## Özellikler

- Dizi arama (TVmaze)
- Bölüm / sezon / tüm diziyi "izledim" olarak işaretleme ve geri alma
- "Buraya kadar izledim": önceki bölümleri de işaretleme
- Sıradaki bölümler listesi, ilerleme çubukları
- Günde bir kez yeni bölüm kontrolü (uygulama açıldığında)
- Spoiler koruması
- Durumlar: İzliyorum / İzleyeceğim / Bitirdim / Bıraktım
- Yaklaşan bölüm takvimi
- İstatistikler, puan ve not
- JSON ile yedekleme / geri yükleme

## Proje yapısı

```
index.html            Sayfa iskeleti ve alt sekmeler
styles.css            Tasarım (koyu/açık tema)
manifest.webmanifest  "Ana ekrana ekle" bilgileri (ad, ikon, renk)
sw.js                 Service worker: internetsiz açılma
js/app.js             Ekranlar ve kullanıcı etkileşimleri
js/logic.js           Saf hesaplamalar (sıradaki bölüm, ilerleme, istatistik…)
js/store.js           Verilerin telefonda saklanması (localStorage)
js/api.js             TVmaze API istekleri
js/ui.js              Bildirim, alt menü, ikonlar
tests/                Birim testleri
```

## Geliştirme

Build adımı yok, sade HTML/CSS/JS.

```bash
# yerelde çalıştır
python3 -m http.server 8000   # → http://localhost:8000

# testler
node --test
```

## Veri kaynağı

Dizi verileri [TVmaze](https://www.tvmaze.com/api) tarafından sağlanır (CC BY-SA).
Kişisel veriler (izlenenler, notlar) sadece telefonda saklanır, hiçbir sunucuya gönderilmez.
