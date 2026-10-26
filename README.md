# Kasir Catat.in — repo mandiri

Kasir browser untuk Ilham ERP. Penjualan dan harga modal langsung tersimpan
di database yang sama. Repo ini hanya berisi aplikasi kasir; halaman ERP tetap di
repo `AccountingIlhamV1/Ilhamoke`.

## Struktur yang benar

Semua berkas berada di **root repo**, bukan di dalam folder tambahan:

```
/
├── index.html
├── login.html
├── manifest.webmanifest
├── sw.js
├── icons/
│   ├── icon-180.png
│   ├── icon-192.png
│   └── icon-512.png
├── assets/
│   ├── auth.js
│   ├── app.js
│   ├── sale-core.js
│   ├── cash-core.js
│   ├── parser.js
│   └── pos-erp.js
└── README.md
```

Kalau `index.html` ditaruh di dalam folder `ilhamini/`, alamatnya menjadi
`.../ilhamini/ilhamini/` dan mudah tertukar. Karena itu versi ini memakai root.

## Alamat

```
https://accountingilhamv1.github.io/ilhamini/
```

ERP:

```
https://accountingilhamv1.github.io/Ilhamoke/
```

Karena POS dan ERP berada di repo terpisah, tautan ke halaman ERP memakai
alamat absolut, misalnya:

```
https://accountingilhamv1.github.io/Ilhamoke/business.html
https://accountingilhamv1.github.io/Ilhamoke/products.html
https://accountingilhamv1.github.io/Ilhamoke/accounts.html
```

Bila domain ERP berubah, ganti alamat tersebut di `index.html` dan
`login.html`.

## Deploy ke GitHub Pages

Unggah **isi** folder ini ke root repo `ilhamini`, bukan foldernya. Di GitHub:

1. Hapus folder lama `ilhamini/` di dalam repo bila masih ada.
2. Upload `index.html`, `login.html`, `manifest.webmanifest`, `sw.js`,
   `icons/`, `assets/`, dan `README.md` ke root.
3. **Settings → Pages → Deploy from a branch → main → / (root)**.
4. Tunggu build selesai, lalu buka:

```
https://accountingilhamv1.github.io/ilhamini/
```

Cek juga:

```
https://accountingilhamv1.github.io/ilhamini/manifest.webmanifest
https://accountingilhamv1.github.io/ilhamini/sw.js
https://accountingilhamv1.github.io/ilhamini/assets/pos-erp.js
```

## Pasang sebagai aplikasi

### Android Chrome

Menu **⋮ → Pasang aplikasi** atau **Tambahkan ke Layar utama**.

### iPhone / iPad Safari

Tombol **Bagikan → Tambahkan ke Layar Utama**.

### Desktop

Ikon pasang di kanan address bar Chrome/Edge.

PWA memerlukan HTTPS; GitHub Pages sudah menyediakannya.

## Orientasi layar

Manifest memakai `"orientation": "any"`, jadi aplikasi ikut berputar mengikuti
perangkat. Di tablet, posisi **landscape** otomatis memakai tata letak dua kolom
(daftar produk di kiri, keranjang di kanan) dan menu atas tampil mendatar.
Di ponsel, tata letak satu kolom dengan menu lipat.

Bila aplikasi sudah terpasang sebelum perubahan ini, hapus pemasangan lama lalu
pasang ulang — Chrome menyimpan orientasi dari manifest saat pemasangan.

## Pemakaian

1. Masuk dengan akun Ilham ERP.
2. Buka **Pengaturan**, pilih usaha, lengkapi akun pencatatan.
3. Lakukan satu penjualan kecil dan periksa catatannya di Ilham ERP.
4. Transaksi yang sudah tersimpan di ERP terkunci dari batal/hapus di POS.
5. Transaksi lokal lama bisa disimpan lewat **Riwayat → Simpan ke ERP**.

## Uang masuk dan uang keluar

Menu **Uang** mencatat uang yang masuk atau keluar selain dari penjualan.
Semua pilihan memakai bahasa sehari-hari supaya bisa dipakai tanpa latar
belakang akuntansi.

| Pilihan di kasir | Artinya |
|---|---|
| Uang masuk | Uang masuk ke kas/bank, dicatat sebagai pendapatan |
| Uang keluar | Belanja atau biaya yang dibayar dari kas/bank |
| Uang dari pemilik | Pemilik menambah uang ke usaha |
| Ambil uang pribadi | Pemilik memakai uang usaha untuk keperluan pribadi |
| Bayar utang | Melunasi utang usaha dari kas/bank |
| Pelanggan bayar utang | Pelanggan melunasi utangnya ke usaha |

Dua cara mengisi:

- **Tulis cepat** — tulis bebas seperti di bot Telegram, misalnya
  “terima 500rb jasa servis”, lalu tekan **Baca**. Mesin `TxParser`
  yang sama dengan kotak masuk Telegram mengisi jenis, tanggal, nominal,
  dan usulan akun.
- **Isi sendiri** — pilih jenis catatan, tanggal, nominal, keterangan, lalu
  akun tujuan dan sumber uang. Akun yang disarankan muncul di grup pertama.

Sebelum disimpan, pilihan akun ditampilkan ulang dengan kalimat seperti
“Uang masuk ke …” dan “Dicatat sebagai …” untuk dikonfirmasi. Catatan yang
sudah tersimpan tidak bisa diubah dari kasir; koreksi dilakukan di Ilham ERP.
Penjualan tetap harus lewat halaman **Kasir** agar rincian barang dan harga
modal ikut tercatat.

Kasir tidak mengubah stok. Koreksi transaksi yang sudah tersimpan dilakukan
di Ilham ERP.

Di balik layar, tiap pilihan menjadi satu baris di tabel `transactions`
lewat `ERP.createTransactionsRemote` (debit/kredit mengikuti aturan
`assets/cash-core.js`). Tidak ada tabel, RPC, atau kolom baru.

## Offline

Service worker menyimpan halaman kasir, login, ikon, modul, dan salinan
katalog terakhir. Saat offline:

- aplikasi tetap terbuka;
- katalog terakhir bisa dilihat;
- transaksi baru **tidak** disimpan offline;
- data Supabase tidak di-cache.

## Catatan pengembangan

- Setelah mengubah berkas yang di-cache, naikkan `VERSION` di `sw.js`.
- Service worker hanya mengontrol path repo kasir, bukan halaman ERP.
- Jangan menaruh service-role/secret key di frontend.
- Jangan menambahkan tabel, RPC, atau kolom baru; gunakan jalur ERP yang sudah
  ada (`SaleCore.buildRows` + `ERP.createTransactionsRemote`).
