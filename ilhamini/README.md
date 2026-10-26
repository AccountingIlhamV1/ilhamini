# Kasir Catat.in

Kasir browser untuk Ilham ERP. Penjualan dan HPP dicatat sebagai jurnal di
Supabase yang sama dengan ERP. Aplikasi ini tidak membuat tabel, RPC, atau
kolom baru, tidak mengubah stok, dan tidak menyimpan kunci rahasia di browser.

## Alamat

| Halaman | Alamat |
| --- | --- |
| Kasir | `/ilhamini/` |
| Masuk | `/ilhamini/login.html` |
| ERP | `/` |

Halaman kasir harus dibuka lewat **HTTPS** atau **localhost** agar bisa
dipasang sebagai aplikasi (PWA). Membuka file HTML langsung dari penyimpanan
perangkat tetap bisa, tetapi fitur pasang dan simpanan offline tidak aktif.

## Pasang sebagai aplikasi

### Android (Chrome)

1. Buka `/ilhamini/` lalu masuk.
2. Ketuk menu **⋮** → **Pasang aplikasi** (atau **Tambahkan ke Layar utama**).
3. Konfirmasi. Ikon **Catat.in** muncul di layar utama.

Kalau tombol pasang belum muncul, buka **Pengaturan → Aplikasi kasir → Cara
pasang**. Browser kadang baru menampilkan tombol setelah halaman dibuka dua
kali.

### iPhone / iPad (Safari)

1. Buka `/ilhamini/` di Safari.
2. Ketuk tombol **Bagikan**.
3. Pilih **Tambahkan ke Layar Utama**, lalu **Tambah**.

### Desktop (Chrome / Edge)

Klik ikon pasang di kanan address bar, atau menu browser → **Pasang Kasir
Catat.in**.

## Pertama kali dipakai

1. Masuk dengan akun Ilham ERP yang biasa dipakai.
2. Pilih usaha aktif di **Pengaturan**.
3. Periksa **Pemetaan akun kasir**:
   - akun debit untuk Tunai, Transfer, dan QRIS;
   - akun pendapatan;
   - akun HPP dan persediaan (dipakai bila produk punya modal).
4. Simpan pemetaan. Pemetaan ini sama dengan yang dipakai impor CSV di ERP.
5. Pastikan produk, harga jual, resep, dan harga bahan sudah benar di ERP.
6. Lakukan satu transaksi kecil, lalu periksa jurnalnya di ERP.

Tanpa akun HPP dan persediaan, penjualan tetap dicatat tetapi HPP dilewati.
Kasir memberi peringatan bila ada item yang belum punya harga modal.

## Pemakaian harian

- **Kasir** → pilih produk → atur jumlah/diskon → **Bayar** → simpan.
- Transaksi langsung dikirim ke ERP. Setelah berhasil, transaksi terkunci:
  tidak bisa dibatalkan atau dihapus dari POS.
- Koreksi transaksi yang sudah tercatat dilakukan lewat **jurnal koreksi di
  ERP**, bukan dari kasir.
- **Riwayat** menampilkan transaksi lokal, status ERP, dan tombol
  **Catat ke ERP** untuk transaksi lama yang belum pernah dikirim.
- **Ekspor CSV** hanya cadangan/unduhan. Integrasi utama tetap jurnal ERP.

## Data lokal lama

Data dari aplikasi kasir versi lama (`catatin.v1`) tidak dihapus. Di Beranda:

1. Tekan **Salin ke usaha ini** untuk memindahkan transaksi lama ke usaha aktif.
2. Buka **Riwayat**, lalu tekan **Catat ke ERP**.
3. Transaksi yang berhasil dicatat akan terkunci dan ditandai **ERP**.

Transaksi lama tidak dikirim otomatis. Ini disengaja agar tidak ada penulisan
jurnal tanpa persetujuan. Bila transaksi yang sama sudah pernah diimpor ke ERP
dengan cara lain, periksa dulu sebelum menekan **Catat ke ERP** agar tidak
tercatat dua kali.

## Offline

Service worker menyimpan kerangka aplikasi, halaman login, ikon, dan modul
kasir. Katalog terakhir juga disalin ke browser.

- Saat offline, aplikasi tetap terbuka dan katalog terakhir bisa dilihat.
- **Transaksi baru tidak disimpan offline.** Tombol simpan dinonaktifkan dan
  muncul peringatan. Sambungkan internet lalu ulangi pembayaran.
- Data ERP (Supabase) tidak pernah di-cache oleh service worker.
- Jangan menutup aplikasi saat transaksi sedang dikirim.

## Batas dan keamanan

- Stok bahan **tidak diubah** oleh kasir. Stok tetap diatur lewat ERP.
- Jurnal penjualan dan HPP memakai mesin yang sama dengan impor CSV ERP
  (`assets/sale-core.js`), jadi rumusnya tidak diduplikasi.
- Tidak ada service-role/secret key di frontend. Hanya sesi login pengguna.
- RLS dan hak akses tetap milik Supabase/ERP.
- Pembatalan transaksi ERP tidak menghapus jurnal; buat jurnal koreksi di ERP.
- Bila harga atau resep berubah saat offline, katalog salinan bisa berbeda
  dari server. Aplikasi menampilkan peringatan katalog salinan.

## Untuk pengembang

Sajikan dari akar repositori, bukan dari dalam `ilhamini/`, karena halaman
memakai `../assets/`:

```bash
python3 -m http.server 8080
# buka http://localhost:8080/ilhamini/
```

Berkas PWA:

- `ilhamini/manifest.webmanifest`
- `ilhamini/sw.js` (scope `/ilhamini/`)
- `ilhamini/icons/icon-180.png`, `icon-192.png`, `icon-512.png`

Saat mengubah berkas yang di-cache, naikkan `VERSION` di `ilhamini/sw.js`.
Service worker hanya mengontrol halaman di `/ilhamini/`; halaman ERP lain tidak
disentuh.

### Pemeriksaan sebelum rilis

- Sintaks JavaScript halaman kasir, login, dan `sw.js`.
- Manifest valid; ikon 180/192/512 ada dan ukurannya benar.
- Uji login, pemetaan akun, satu penjualan tanpa modal, satu penjualan dengan
  resep/HPP, dan satu transaksi lama lewat **Catat ke ERP**.
- Pastikan jurnal di ERP seimbang dan tidak ada baris ganda.
- Pastikan tombol batal/hapus tidak tersedia untuk transaksi berstatus ERP.
- Pasang aplikasi di Android/iPhone, lalu buka sekali dalam keadaan offline.
