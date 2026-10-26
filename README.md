# Kasir Catat.in

Kasir web statis untuk usaha kecil. Masuk memakai akun Ilham ERP yang sama, dan penjualan langsung tercatat ke Ilham ERP (Supabase).

## Fitur

- **Kasir:** pilih produk dari katalog ERP, diskon per barang, pembayaran Tunai, Transfer, atau QRIS, kembalian, dan cetak struk.
- **Tercatat ke ERP:** penjualan dan harga modal masuk sebagai catatan di Ilham ERP, dengan pengecekan transaksi ganda.
- **Uang masuk & keluar:** tulis seperti chat (contoh: "beli galon 20rb", "tambah modal 2jt") atau isi manual.
- **Beranda:** ringkasan hari ini, kemarin, dan 7 hari yang dihitung dari data ERP (menyatukan semua perangkat).
- **Lainnya:** ganti usaha, mode offline dengan peringatan, dan bisa dipasang sebagai aplikasi (PWA).

## Menjalankan lokal

Buka `index.html` lewat server lokal, misalnya `python3 -m http.server`, lalu buka <http://localhost:8000>. Halaman ini memanggil berkas di folder `assets/` (auth, sale-core, cash-core, parser, app, pos-erp) yang berasal dari Ilham ERP, jadi folder itu harus ada di samping `index.html`.

## Deploy GitHub Pages

1. Unggah `index.html`, `README.md`, dan folder `assets/` ke root repository.
2. Settings → Pages → Source: *Deploy from a branch* → branch `main`, folder `/ (root)`.
3. Semua path relatif dan navigasi memakai hash (`#`), jadi refresh dan subpath aman.

## Batasan

- Stok bahan tidak berubah otomatis dari kasir.
- Riwayat di halaman Riwayat tersimpan di browser perangkat itu saja. Data resmi ada di Ilham ERP.
- Transaksi yang sudah tercatat di ERP tidak bisa dibatalkan dari kasir. Koreksi dilakukan di Ilham ERP.
