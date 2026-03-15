# REJAY 🎭

**Tiyatro Reji ve Prompter Asistanı**

REJAY, tiyatro kumpanyalarının sahne reji süreçlerini dijitalleştirmek, ses ve ışık tetikleyicilerini (cue) senaryo ile senkronize yönetmek için tasarlanmış profesyonel bir sahne yönetim aracıdır.

## ✨ Özellikler

- 📄 **Akıllı PDF İşleme:** Tiyatro senaryolarınızı yükleyin, karakter isimleri ve sahne yönergeleri otomatik olarak ayrıştırılsın.
- 🔊 **Ses ve Efekt Yönetimi:** Fade-in, fade-out, döngü (loop) ve ses seviyesi kontrollü profesyonel ses tetikleyicileri.
- 💡 **Işık ve Aksiyon Uyarıları:** Sahne amiri ve ışık şefi için görsel geri bildirim ve erken uyarı sistemi.
- 🛡️ **Veri Güvenliği:** 
  - `localStorage` ile otomatik kayıt (Auto-save).
  - `IndexedDB` ile ses dosyalarının tarayıcı hafızasında kalıcı depolanması.
  - Sayfa yenileme koruması.
- 🔍 **Dinamik Zoom:** Uzak mesafeden kolay okunabilirlik için ayarlanabilir senaryo font boyutu.
- 💾 **Proje Dışa/İçe Aktar:** Tüm çalışmanızı `.rejay` dosyası olarak yedekleyin veya başka bir bilgisayara taşıyın.

## 🚀 Hızlı Başlangıç

### Kurulum

1. Depoyu klonlayın:
   ```bash
   git clone https://github.com/canmars/rejay.git
   cd rejay
   ```

2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

3. Geliştirme sunucusunu başlatın:
   ```bash
   npm run dev
   ```

## 🏗️ Kullanılan Teknolojiler

- **Frontend:** React, Vite, TailwindCSS
- **PDF Processing:** PDF.js
- **Veri Depolama:** idb (IndexedDB Wrapper), LocalStorage

## 📜 Lisans

Bu proje **MIT** lisansı ile korunmaktadır. Detaylar için [LICENSE](./LICENSE) dosyasına göz atabilirsiniz.

---
*REJAY — Sahnede her şey kontrolünüz altında.* 🎬
