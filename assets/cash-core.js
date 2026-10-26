/* =====================================================
   KASIR CATAT.IN — MESIN JURNAL KAS
   -----------------------------------------------------
   Satu sumber aturan untuk mengubah satu entri kas menjadi
   satu baris jurnal ERP:

     Pemasukan        Debit  kas/bank   Kredit pendapatan
     Pengeluaran      Debit  beban      Kredit kas/bank
     Setor modal      Debit  kas/bank   Kredit modal
     Prive            Debit  prive      Kredit kas/bank
     Bayar utang      Debit  utang      Kredit kas/bank
     Terima piutang   Debit  kas/bank   Kredit piutang

   Modul ini TIDAK menyentuh DOM, Supabase, localStorage,
   atau auth. Tugasnya hanya memvalidasi dan menyusun data.
   Penulisan ke database tetap lewat ERP.createTransactionsRemote.
   Tidak ada tabel, RPC, atau kolom baru.
===================================================== */

window.CashCore = (function () {
  "use strict";

  /* Label memakai bahasa sehari-hari supaya bisa dipakai pemilik usaha
     tanpa latar belakang akuntansi. Peran akun di bawah tetap teknis. */
  const TYPES = [
    {
      id: "masuk",
      label: "Uang masuk",
      debitLabel: "Uang masuk ke",
      creditLabel: "Dicatat sebagai",
      debitRole: "cash",
      creditRole: "revenue",
      debitHint: [/^kas$/i, /^kas\b/i, /\bbank\b/i],
      creditHint: [/^pendapatan penjualan$/i, /^pendapatan jasa$/i, /^pendapatan lain/i, /^pendapatan/i],
      note: "Uang masuk selain dari penjualan, misalnya upah jasa atau bunga bank."
    },
    {
      id: "keluar",
      label: "Uang keluar",
      debitLabel: "Dibayar untuk",
      creditLabel: "Uang diambil dari",
      debitRole: "expense",
      creditRole: "cash",
      debitHint: [/^beban\b/i],
      creditHint: [/^kas$/i, /^kas\b/i, /\bbank\b/i],
      note: "Belanja atau biaya yang dibayar dari uang kas atau bank."
    },
    {
      id: "modal",
      label: "Uang dari pemilik",
      debitLabel: "Uang masuk ke",
      creditLabel: "Dicatat sebagai",
      debitRole: "cash",
      creditRole: "equity",
      debitHint: [/^kas$/i, /^kas\b/i, /\bbank\b/i],
      creditHint: [/^modal$/i, /^modal\b/i],
      note: "Pemilik menambah uang ke usaha."
    },
    {
      id: "prive",
      label: "Ambil uang pribadi",
      debitLabel: "Dicatat sebagai",
      creditLabel: "Uang diambil dari",
      debitRole: "equity",
      creditRole: "cash",
      debitHint: [/prive/i],
      creditHint: [/^kas$/i, /^kas\b/i, /\bbank\b/i],
      note: "Pemilik memakai uang usaha untuk keperluan pribadi."
    },
    {
      id: "bayar_utang",
      label: "Bayar utang",
      debitLabel: "Dibayar untuk",
      creditLabel: "Uang diambil dari",
      debitRole: "liability",
      creditRole: "cash",
      debitHint: [/^utang usaha$/i, /^utang dagang$/i, /^utang/i],
      creditHint: [/^kas$/i, /^kas\b/i, /\bbank\b/i],
      note: "Membayar utang usaha dari uang kas atau bank."
    },
    {
      id: "terima_piutang",
      label: "Pelanggan bayar utang",
      debitLabel: "Uang masuk ke",
      creditLabel: "Dicatat sebagai",
      debitRole: "cash",
      creditRole: "asset",
      debitHint: [/^kas$/i, /^kas\b/i, /\bbank\b/i],
      creditHint: [/^piutang usaha$/i, /^piutang dagang$/i, /^piutang/i],
      note: "Pelanggan melunasi utangnya ke usaha."
    }
  ];

  /* ---------- PERAN AKUN ---------- */

  function groupOf(account) {
    return String((account && account.group) || "").toLowerCase();
  }

  function nameOf(account) {
    return String((account && account.name) || "").toLowerCase().replace(/^[-*\s]+/, "");
  }

  const ROLES = {
    cash: function (a) {
      return !!(a && (a.isCash === true || /\b(kas|bank|cash)\b/i.test(nameOf(a))));
    },
    revenue: function (a) { return /^pendapatan/.test(groupOf(a)); },
    expense: function (a) { return /^beban/.test(groupOf(a)); },
    equity: function (a) { return /^ekuitas/.test(groupOf(a)); },
    liability: function (a) { return /^liabilitas/.test(groupOf(a)); },
    asset: function (a) { return /^aset/.test(groupOf(a)); }
  };

  function matchRole(account, role) {
    const test = ROLES[role];
    return !!(test && account && test(account));
  }

  function pickAccount(accounts, role, hints) {
    const list = (accounts || []).filter(function (a) { return matchRole(a, role); });
    for (let i = 0; i < (hints || []).length; i++) {
      const hit = list.find(function (a) { return hints[i].test(nameOf(a)); });
      if (hit) return hit.id;
    }
    return list.length ? list[0].id : "";
  }

  function typeOf(id) {
    return TYPES.find(function (t) { return t.id === String(id || ""); }) || null;
  }

  /* Tebakan awal akun debit/kredit untuk satu jenis entri. */
  function guessAccounts(accounts, typeId) {
    const type = typeOf(typeId);
    if (!type) return { debit: "", credit: "" };
    return {
      debit: pickAccount(accounts, type.debitRole, type.debitHint),
      credit: pickAccount(accounts, type.creditRole, type.creditHint)
    };
  }

  /* ---------- SUSUN JURNAL ---------- */

  function validDate(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) &&
      d.getUTCMonth() === Number(m[2]) - 1 &&
      d.getUTCDate() === Number(m[3]);
  }

  function describe(type, note) {
    const clean = String(note || "").trim().replace(/\s+/g, " ").slice(0, 240);
    return "Kasir: " + (type ? type.label : "Kas") + (clean ? " — " + clean : "");
  }

  /* entry: { id, type, date, amount, note, debitAccountId, creditAccountId }
     Hasil: { ok, errors, row } — row berbentuk data transaksi ERP. */
  function buildEntry(businessId, entry, createdAt) {
    const errors = [];
    const e = entry || {};

    if (!businessId) errors.push("Usahanya belum dipilih.");

    const id = String(e.id || "");
    if (!id) errors.push("Nomor catatan kosong.");

    if (!validDate(e.date)) errors.push("Tanggalnya belum benar.");

    const type = typeOf(e.type);
    if (!type) errors.push("Jenis catatan tidak dikenal.");

    const amount = Number(e.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      errors.push("Jumlahnya harus angka bulat lebih dari nol.");
    }

    const debit = String(e.debitAccountId || "");
    const credit = String(e.creditAccountId || "");
    if (!debit || !credit) errors.push("Akunnya belum dipilih.");
    if (debit && credit && debit === credit) {
      errors.push("Pilihan akunnya tidak boleh sama.");
    }

    if (errors.length) return { ok: false, errors: errors, row: null };

    return {
      ok: true,
      errors: [],
      row: {
        businessId: businessId,
        date: String(e.date),
        invoice: id,
        description: describe(type, e.note),
        debitAccountId: debit,
        creditAccountId: credit,
        amount: amount,
        sourceId: id,
        source: "catatin-kas",
        createdAt: createdAt || new Date().toISOString()
      }
    };
  }

  return {
    TYPES: TYPES,
    typeOf: typeOf,
    matchRole: matchRole,
    guessAccounts: guessAccounts,
    describe: describe,
    buildEntry: buildEntry
  };
})();
