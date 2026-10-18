# Kasir Catat.in
Aplikasi kasir web statis (satu file `index.html`, tanpa build). Mode demo: akun dan data tersimpan di localStorage browser, bukan autentikasi/penyimpanan produksi.

## Menjalankan lokal
Buka `index.html` di browser, atau `python3 -m http.server` lalu buka http://localhost:8000.

## Deploy GitHub Pages
1. Buat repository baru (jangan pakai repo IlhamERP), unggah `index.html`, `CSV-SPEC.md`, `README.md` ke root.
2. Settings → Pages → Source: *Deploy from a branch* → branch `main`, folder `/ (root)`.
3. Buka `https://<user>.github.io/<repo>/`. Semua path relatif dan navigasi memakai hash (`#`), jadi refresh dan subpath aman.

## Batasan
Data terikat browser/perangkat dan tidak dicadangkan online; satu akun per browser; belum terhubung ke IlhamERP; belum ada koreksi/pembatalan transaksi.
