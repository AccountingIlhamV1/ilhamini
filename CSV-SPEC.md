# Spesifikasi CSV Kasir Catat.in — skema versi 1.2

Kontrak data antara Kasir Catat.in dan IlhamERP. Jangan ubah nama/arti kolom tanpa menaikkan `schema_version` dan memperbarui dokumen ini.

**Format:** UTF-8 dengan BOM, pemisah koma, akhir baris CRLF, header di baris pertama. Field berisi koma, tanda kutip, atau baris baru dibungkus tanda kutip ganda; tanda kutip di dalamnya digandakan (`""`). Tanggal `YYYY-MM-DD`, waktu `HH:mm:ss` (waktu lokal perangkat). Angka tanpa simbol Rp, bilangan bulat rupiah, tanpa pemisah ribuan (desimal, jika kelak ada, memakai titik).

**Satu baris = satu item produk dalam transaksi.** Transaksi berisi banyak produk menghasilkan banyak baris dengan `transaction_id` sama. Kolom level transaksi (`transaction_total`, `amount_paid`, `change_amount`, `payment_method`, tanggal, waktu) diulang di setiap baris transaksi itu. **Jangan menjumlahkan `transaction_total` per baris**; hitung total penjualan dengan satu nilai per `(business_id, transaction_id)` unik, atau jumlahkan `line_total`.

| # | Kolom | Tipe | Arti |
|---|---|---|---|
| 1 | schema_version | teks | Versi skema, saat ini `1.2` |
| 2 | business_id | teks | ID usaha, dibuat saat registrasi (`BIZ-XXXXXXXX`) |
| 3 | transaction_id | teks | `TRX-YYYYMMDD-NNNN`; unik per usaha |
| 4 | transaction_date | tanggal | Tanggal transaksi |
| 5 | transaction_time | waktu | Waktu transaksi |
| 6 | payment_method | teks | `Tunai`, `Transfer`, atau `QRIS` (hanya dicatat, tidak diverifikasi) |
| 7 | product_id | teks | ID produk stabil (`PRD-XXXXXXXX`) |
| 8 | product_name | teks | Nama produk saat transaksi (snapshot) |
| 9 | quantity | bilangan bulat | ≥ 1 |
| 10 | unit_price | bilangan bulat | Harga satuan saat transaksi (snapshot) |
| 11 | discount_amount | bilangan bulat | Diskon rupiah untuk baris ini; 0 jika tanpa diskon |
| 12 | line_total | bilangan bulat | `quantity × unit_price − discount_amount` |
| 13 | transaction_total | bilangan bulat | Jumlah semua `line_total` transaksi (diulang tiap baris) |
| 14 | amount_paid | bilangan bulat | Tunai: uang diterima. Transfer/QRIS: sama dengan total |
| 15 | change_amount | bilangan bulat | `amount_paid − transaction_total`; 0 untuk non-tunai |
| 16 | product_code | teks | Kode produk otomatis `SINGKATAN-001` saat transaksi (snapshot; kosong jika data lama tidak punya kode). Kode produk lama dapat berformat lain |
| 17 | unit_cost | bilangan bulat | Harga modal per satuan saat transaksi (snapshot). **Kosong** jika produk belum punya harga modal; `0` berarti modal memang nol |
| 18 | cogs_total | bilangan bulat | `quantity × unit_cost` untuk baris ini; kosong jika `unit_cost` kosong. Jumlahkan per transaksi untuk HPP |

**Identitas & duplikasi:** kunci unik transaksi adalah `business_id` + `transaction_id`; ekspor ulang menghasilkan ID yang sama. **Nama file:** `catatin_transaksi_<business_id>_YYYYMMDD_HHMMSS.csv`.
**Catatan:** Ekspor tidak mengubah data sumber dan tidak berarti data sudah diimpor ke sistem lain.

**Transaksi dibatalkan:** transaksi berstatus Dibatalkan di aplikasi tidak disertakan dalam ekspor (skema 1.0 tidak punya kolom status). Penanda "Diekspor" di aplikasi hanya penanda lokal, bukan bukti file sudah diimpor.

**Harga modal (HPP):** opsional dan berlaku untuk semua jenis usaha (toko: harga beli per satuan; kuliner: perkiraan biaya bahan per porsi; jasa: boleh kosong). Nilainya diambil dari data produk saat item dimasukkan ke keranjang, sehingga mengubah harga modal produk tidak mengubah transaksi lama. Baris dengan `unit_cost` kosong tidak punya HPP; konsumen CSV tidak boleh menganggapnya nol.

**Riwayat skema:** 1.2 menambahkan kolom 17 `unit_cost` dan 18 `cogs_total` di akhir; kolom 1-16 tidak berubah, jadi file 1.1 tetap valid (kolom baru dianggap kosong). 1.1 menambahkan kolom 16 `product_code` di akhir; kolom 1-15 tidak berubah. Kode produk tidak berubah ketika nama produk diedit.
