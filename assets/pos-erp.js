/* =====================================================
   KASIR CATAT.IN — JEMBATAN KE ILHAM ERP
   -----------------------------------------------------
   Modul ini menghubungkan layar kasir dengan data yang
   sudah ada di Supabase (usaha, COA, produk, bahan, resep)
   dan menulis penjualan lewat jalur ERP yang sudah dipakai:

       SaleCore.buildRows(...)
       ERP.createTransactionsRemote(...)

   Aturan jurnal/HPP tetap satu sumber di assets/sale-core.js.
   Modul ini tidak membuat tabel, RPC, atau kolom baru.
   Stok bahan diubah hanya oleh penjualan (lewat resep) dan Beli Bahan.
===================================================== */

window.PosERP = (function () {
  "use strict";

  const METHODS = ["Tunai", "Transfer", "QRIS"];
  const MAP_KEY = "ilhamERP_importMap";

  function requireClient() {
    if (!window.ERPAuth || !ERPAuth.client) {
      throw new Error("Layanan login belum termuat. Muat ulang halaman.");
    }
    return ERPAuth.client;
  }

  function requireERP() {
    if (typeof ERP === "undefined" || typeof SaleCore === "undefined") {
      throw new Error("Mesin ERP belum termuat. Muat ulang halaman.");
    }
  }

  function accountExists(accounts, id) {
    return !!(id && accounts && accounts.some(function (a) {
      return ERP.idEqual(a.id, id);
    }));
  }

  /* ---------- PEMETAAN AKUN (disimpan per usaha) ----------
     Kunci yang sama dipakai halaman impor CSV di ERP, supaya
     kasir dan impor tidak perlu memilih akun dua kali. */

  function loadMapping(businessId) {
    try {
      const all = JSON.parse(localStorage.getItem(MAP_KEY) || "{}");
      return all[String(businessId)] || {};
    } catch (error) {
      return {};
    }
  }

  function saveMapping(businessId, map) {
    try {
      const all = JSON.parse(localStorage.getItem(MAP_KEY) || "{}");
      all[String(businessId)] = map;
      localStorage.setItem(MAP_KEY, JSON.stringify(all));
    } catch (error) {
      console.error("Gagal menyimpan pemetaan akun:", error);
    }
    return map;
  }

  // Tebakan awal akun, mengikuti kebiasaan halaman impor ERP.
  function guessAccount(accounts, key) {
    const nameIs = function (re) {
      return accounts.find(function (a) { return re.test(a.name || ""); });
    };
    const cash = accounts.filter(function (a) { return a.isCash; });

    if (key === "__revenue") {
      return (nameIs(/^pendapatan penjualan$/i) ||
        accounts.find(function (a) {
          return ERP.REVENUE_GROUPS.indexOf(a.group) !== -1 && /penjualan/i.test(a.name || "");
        }) ||
        accounts.find(function (a) {
          return ERP.REVENUE_GROUPS.indexOf(a.group) !== -1;
        }) || {}).id || "";
    }
    if (key === "__cogs") {
      return (nameIs(/^harga pokok penjualan$/i) || nameIs(/harga pokok|\bhpp\b/i) || {}).id || "";
    }
    if (key === "__inventory") {
      return (nameIs(/^persediaan barang dagang$/i) || nameIs(/^persediaan barang jadi$/i) ||
        accounts.find(function (a) {
          return /^persediaan/i.test(a.name || "") && !/dalam perjalanan|dalam proses/i.test(a.name || "");
        }) || {}).id || "";
    }

    const k = String(key).toLowerCase();
    if (k === "tunai" || k === "cash") {
      return (cash.find(function (a) { return /^kas$/i.test(a.name); }) ||
        cash.find(function (a) { return /\bkas\b/i.test(a.name); }) ||
        cash[0] || {}).id || "";
    }
    if (k === "qris" || /wallet|ovo|gopay|dana|shopee/.test(k)) {
      return (cash.find(function (a) { return /dompet digital|e-?wallet/i.test(a.name); }) ||
        cash.find(function (a) { return /\bbank\b/i.test(a.name); }) ||
        cash[0] || {}).id || "";
    }
    return (cash.find(function (a) { return /\bbank\b/i.test(a.name); }) || cash[0] || {}).id || "";
  }

  function guessMapping(accounts, methods) {
    const map = {};
    (methods || METHODS).forEach(function (method) {
      map[method] = guessAccount(accounts, method);
    });
    map.__revenue = guessAccount(accounts, "__revenue");
    map.__cogs = guessAccount(accounts, "__cogs");
    map.__inventory = guessAccount(accounts, "__inventory");
    return map;
  }

  // Daftar masalah yang membuat satu metode belum bisa dipakai.
  function mappingProblems(map, accounts, method, cogsTotal, businessId) {
    requireERP();
    const out = [];
    const m = map || {};

    if (businessId !== undefined && businessId !== null && !ERP.isUuid(businessId)) {
      out.push("Usaha belum tersimpan di server ERP.");
    }
    if (!accountExists(accounts, m[method])) {
      out.push("Uang masuk lewat " + method + " belum dipilih akunnya.");
    }
    if (!accountExists(accounts, m.__revenue)) {
      out.push("Akun pendapatan penjualan belum dipilih.");
    }
    if (accountExists(accounts, m[method]) && accountExists(accounts, m.__revenue) &&
        ERP.idEqual(m[method], m.__revenue)) {
      out.push("Akun uang masuk dan akun pendapatan tidak boleh sama.");
    }

    if (Number(cogsTotal) > 0) {
      if (!accountExists(accounts, m.__cogs)) out.push("Akun harga modal belum dipilih.");
      if (!accountExists(accounts, m.__inventory)) out.push("Akun stok barang belum dipilih.");
      if (accountExists(accounts, m.__cogs) && accountExists(accounts, m.__inventory) &&
          ERP.idEqual(m.__cogs, m.__inventory)) {
        out.push("Akun harga modal dan akun stok barang tidak boleh sama.");
      }
    }

    return out;
  }

  // Ringkasan untuk layar Pengaturan (semua metode sekaligus).
  function mappingSummary(map, accounts, methods, hasCost) {
    requireERP();
    const out = [];
    const m = map || {};
    const list = methods || METHODS;

    if (!accountExists(accounts, m.__revenue)) out.push("Akun pendapatan penjualan belum dipilih.");
    list.forEach(function (method) {
      if (!accountExists(accounts, m[method])) {
        out.push("Uang masuk lewat " + method + " belum dipilih akunnya.");
      } else if (accountExists(accounts, m.__revenue) && ERP.idEqual(m[method], m.__revenue)) {
        out.push("Akun uang masuk lewat " + method + " sama dengan akun pendapatan.");
      }
    });

    if (hasCost) {
      if (!accountExists(accounts, m.__cogs)) out.push("Akun harga modal belum dipilih (harga modal belum bisa dicatat).");
      if (!accountExists(accounts, m.__inventory)) out.push("Akun stok barang belum dipilih (harga modal belum bisa dicatat).");
      if (accountExists(accounts, m.__cogs) && accountExists(accounts, m.__inventory) &&
          ERP.idEqual(m.__cogs, m.__inventory)) {
        out.push("Akun harga modal dan akun stok barang tidak boleh sama.");
      }
    }
    return out;
  }

  function hasAnyMapping(map, accounts) {
    if (!map) return false;
    return ["__revenue", "__cogs", "__inventory"].concat(METHODS).some(function (key) {
      return accountExists(accounts, map[key]);
    });
  }

  /* ---------- KATALOG DARI SUPABASE ---------- */

  async function loadCatalog(businessId) {
    requireERP();
    const sb = requireClient();

    const responses = await Promise.all([
      sb.from("materials").select("id,name,unit,price").eq("business_id", businessId).order("name"),
      sb.from("products").select("id,name,sell_price,cost_override,active").eq("business_id", businessId).order("name"),
      sb.from("product_recipe").select("product_id,material_id,qty").eq("business_id", businessId)
    ]);

    responses.forEach(function (res) {
      if (res.error) throw res.error;
    });

    const materials = {};
    (responses[0].data || []).forEach(function (m) {
      materials[m.id] = m;
    });

    const recipeByProduct = {};
    (responses[2].data || []).forEach(function (row) {
      if (!recipeByProduct[row.product_id]) recipeByProduct[row.product_id] = [];
      recipeByProduct[row.product_id].push({
        material_id: row.material_id,
        qty: Number(row.qty)
      });
    });

    return (responses[1].data || [])
      .filter(function (p) { return p.active !== false; })
      .map(function (p) {
        const cost = SaleCore.costOfProduct(p, recipeByProduct[p.id] || [], materials);
        const usableCost = cost === null || cost === undefined || !isFinite(Number(cost)) ? null : Number(cost);
        return {
          id: p.id,
          name: p.name || "",
          price: Number(p.sell_price) || 0,
          cost: usableCost,
          code: "PRD-" + String(p.id).replace(/-/g, "").slice(0, 8).toUpperCase(),
          active: true
        };
      })
      .filter(function (p) { return p.name; });
  }

  /* ---------- SINKRON DATA ERP ---------- */

  async function syncERP() {
    requireERP();
    if (!window.ERPAuth) throw new Error("Layanan login belum termuat. Muat ulang halaman.");
    await ERP.syncBusinesses();
    await ERP.syncAccounts();
    await ERP.syncTransactions();
  }

  /* ---------- TULIS PENJUALAN ---------- */

  // true kalau penjualan dengan sumber ini sudah ada di server.
  function isPosted(sourceId, businessId) {
    requireERP();
    if (!sourceId) return false;
    return ERP.getActiveTransactions().some(function (t) {
      if (String(t.sourceId || "") !== String(sourceId)) return false;
      if (t.source !== "catatin") return false;
      return businessId ? ERP.idEqual(t.businessId, businessId) : true;
    });
  }

  /* Kirim satu penjualan ke jurnal ERP. Mengembalikan:
       { ok, duplicate, errors, warnings, cogs }
     Tidak pernah mengubah stok. */
  async function postSale(businessId, sale, mapping) {
    requireERP();

    const built = SaleCore.buildRows(businessId, sale, mapping || {}, new Date().toISOString());
    if (!built.ok) {
      return { ok: false, duplicate: false, errors: built.errors, warnings: built.warnings, cogs: 0 };
    }

    // Segarkan cache dulu supaya pemeriksaan duplikat tidak memakai data lama.
    await ERP.syncTransactions();

    if (isPosted(sale.id, businessId)) {
      return {
        ok: true,
        duplicate: true,
        errors: [],
        warnings: built.warnings,
        cogs: built.cogs ? Number(built.cogs.amount) : 0
      };
    }

    const rows = [built.sales];
    if (built.cogs) rows.push(built.cogs);

    await ERP.createTransactionsRemote(businessId, rows, { dedupeReferences: true });

    return {
      ok: true,
      duplicate: false,
      errors: [],
      warnings: built.warnings,
      cogs: built.cogs ? Number(built.cogs.amount) : 0
    };
  }

  /* ---------- TULIS JURNAL KAS ----------
     Pemasukan, pengeluaran, modal, prive, bayar utang, dan
     terima piutang memakai tabel transactions yang sama.
     Satu entri = satu baris jurnal. Stok tidak disentuh. */

  function requireCash() {
    if (!window.CashCore) {
      throw new Error("Bagian catat uang belum termuat. Muat ulang halaman.");
    }
    return window.CashCore;
  }

  function cashPosted(sourceId, businessId) {
    requireERP();
    if (!sourceId) return false;
    return ERP.getActiveTransactions().some(function (t) {
      if (String(t.sourceId || "") !== String(sourceId)) return false;
      if (t.source !== "catatin-kas") return false;
      return businessId ? ERP.idEqual(t.businessId, businessId) : true;
    });
  }

  async function postCash(businessId, entry) {
    requireERP();
    const built = requireCash().buildEntry(businessId, entry, new Date().toISOString());
    if (!built.ok) {
      return { ok: false, duplicate: false, errors: built.errors };
    }

    // Segarkan cache dulu supaya pemeriksaan duplikat tidak memakai data lama.
    await ERP.syncTransactions();

    if (cashPosted(entry.id, businessId)) {
      return { ok: true, duplicate: true, errors: [] };
    }

    await ERP.createTransactionsRemote(businessId, [built.row], { dedupeReferences: true });

    return { ok: true, duplicate: false, errors: [] };
  }

  // Entri kas yang sudah tercatat, terbaru lebih dulu.
  function cashEntries(businessId) {
    requireERP();
    return ERP.getActiveTransactions()
      .filter(function (t) {
        if (t.source !== "catatin-kas") return false;
        return businessId ? ERP.idEqual(t.businessId, businessId) : true;
      })
      .slice()
      .sort(function (a, b) {
        const byDate = String(b.date || "").localeCompare(String(a.date || ""));
        if (byDate) return byDate;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  /* ---------- BELI BAHAN BAKU ----------
     Sama seperti menu "Beli stok/bahan" di bot Telegram:
       1) jurnal: debit Persediaan Bahan Baku, kredit Kas/Bank
       2) harga bahan diperbarui ke harga beli terbaru (total / jumlah)
       3) stok bahan bertambah sebanyak jumlah yang dibeli
     Pembayaran hanya Tunai/Transfer/QRIS (tanpa bayar nanti).
     Stok dan harga hanya disentuh kalau jurnal berhasil dan bukan duplikat. */

  const PURCHASE_SOURCE = "catatin-beli";

  function accName(a) {
    return String((a && a.name) || "").toLowerCase().replace(/^[-*\s]+/, "");
  }

  function isContraAccount(a) {
    return /akumulasi|cadangan kerugian|diskonto|treasuri/.test(accName(a));
  }

  // Akun Persediaan Bahan Baku (aset, bukan akun pengurang).
  function purchaseAccount(accounts) {
    requireERP();
    const hits = (accounts || []).filter(function (a) {
      return ERP.ASSET_GROUPS.indexOf(a.group) >= 0 && !isContraAccount(a) &&
        /^persediaan bahan baku/.test(accName(a));
    });
    hits.sort(function (x, y) { return accName(x).length - accName(y).length; });
    return hits[0] || null;
  }

  function purchaseProblems(map, accounts, method, businessId) {
    requireERP();
    const out = [];
    const m = map || {};
    if (businessId !== undefined && businessId !== null && !ERP.isUuid(businessId)) {
      out.push("Usaha belum tersimpan di server ERP.");
    }
    if (!purchaseAccount(accounts)) {
      out.push("Akun Persediaan Bahan Baku belum ada di daftar akun. Tambahkan dulu di ERP, menu Chart of Accounts.");
    }
    if (!accountExists(accounts, m[method])) {
      out.push("Uang keluar lewat " + method + " belum dipilih akunnya di Pengaturan.");
    }
    return out;
  }

  async function loadMaterials(businessId) {
    const sb = requireClient();
    const res = await sb.from("materials").select("id,name,unit,price,stock")
      .eq("business_id", businessId).order("name");
    if (res.error) throw res.error;
    return (res.data || []).map(function (m) {
      return {
        id: m.id,
        name: m.name || "",
        unit: m.unit || "",
        price: Number(m.price) || 0,
        stock: m.stock === null || m.stock === undefined ? null : Number(m.stock)
      };
    }).filter(function (m) { return m.name; });
  }

  function purchasePosted(sourceId, businessId) {
    requireERP();
    if (!sourceId) return false;
    return ERP.getActiveTransactions().some(function (t) {
      if (String(t.sourceId || "") !== String(sourceId)) return false;
      if (t.source !== PURCHASE_SOURCE) return false;
      return businessId ? ERP.idEqual(t.businessId, businessId) : true;
    });
  }

  function roundTo(n, digits) {
    const k = Math.pow(10, digits);
    return Math.round(n * k) / k;
  }

  // Harga per satuan, dibulatkan 2 desimal (sama dengan bot).
  function unitPriceOf(amount, qty) {
    return roundTo(Number(amount) / Number(qty), 2);
  }

  // Tambah stok bahan. Hanya menulis kalau stok belum diubah perangkat lain.
  async function addMaterialStock(businessId, materialId, qty) {
    const sb = requireClient();
    let last;
    for (let t = 0; t < 3; t++) {
      const g = await sb.from("materials").select("name,unit,stock")
        .eq("id", materialId).eq("business_id", businessId).limit(1);
      if (g.error || !g.data || !g.data.length) return null;
      const raw = g.data[0].stock;
      if (t > 0 && raw === last) return null;
      last = raw;
      const next = roundTo((Number(raw) || 0) + Number(qty), 4);
      let q = sb.from("materials").update({ stock: next })
        .eq("id", materialId).eq("business_id", businessId);
      q = raw === null || raw === undefined ? q.is("stock", null) : q.eq("stock", raw);
      const up = await q.select("id");
      if (up.error) return null;
      if (up.data && up.data.length) {
        return { name: g.data[0].name || "", unit: g.data[0].unit || "", stock: next };
      }
    }
    return null;
  }

  /* purchase = { id, date, method, amount, qty, materialId, materialName, materialUnit, note }
     materialId boleh kosong (bahan di luar daftar): hanya jurnal.
     Mengembalikan { ok, duplicate, errors, warnings, unitPrice, priceOk, stock } */
  async function postPurchase(businessId, purchase, mapping) {
    requireERP();
    const p = purchase || {};
    const accounts = ERP.getActiveAccounts();
    const result = { ok: false, duplicate: false, errors: [], warnings: [], unitPrice: null, priceOk: null, stock: null };

    const problems = purchaseProblems(mapping, accounts, p.method, businessId);
    if (problems.length) { result.errors = problems; return result; }

    const amount = Math.round(Number(p.amount));
    if (!(amount > 0)) { result.errors = ["Total bayar harus lebih dari 0."]; return result; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ""))) { result.errors = ["Tanggal tidak valid."]; return result; }
    const hasMaterial = !!p.materialId;
    const qty = Number(p.qty);
    if (hasMaterial && !(qty > 0 && isFinite(qty))) { result.errors = ["Jumlah yang dibeli harus lebih dari 0."]; return result; }

    const debit = purchaseAccount(accounts);
    const creditId = mapping[p.method];
    if (ERP.idEqual(debit.id, creditId)) { result.errors = ["Akun persediaan dan akun uang tidak boleh sama."]; return result; }

    const qtyText = String(roundTo(qty, 4)).replace(".", ",");
    const desc = ("Beli bahan: " + (hasMaterial ? p.materialName + " " + qtyText + " " + (p.materialUnit || "") : "bahan lain") +
      (p.note ? " - " + p.note : "")).replace(/\s+/g, " ").trim().slice(0, 200);

    await ERP.syncTransactions();
    if (purchasePosted(p.id, businessId)) {
      result.ok = true; result.duplicate = true; return result;
    }

    await ERP.createTransactionsRemote(businessId, [{
      date: p.date,
      invoice: p.id,
      description: desc,
      amount: amount,
      debitAccountId: debit.id,
      creditAccountId: creditId,
      source: PURCHASE_SOURCE,
      sourceId: p.id
    }], { dedupeReferences: true });

    result.ok = true;
    if (!hasMaterial) return result;

    // Jurnal sudah tersimpan. Kegagalan di bawah ini hanya jadi peringatan.
    try {
      const sb = requireClient();
      result.unitPrice = unitPriceOf(amount, qty);
      const up = await sb.from("materials").update({ price: result.unitPrice })
        .eq("id", p.materialId).eq("business_id", businessId).select("id");
      result.priceOk = !up.error && !!(up.data && up.data.length);
      if (!result.priceOk) result.warnings.push("Harga " + p.materialName + " belum berhasil diperbarui. Cek di ERP, menu Bahan & Produk.");
    } catch (e) {
      result.priceOk = false;
      result.warnings.push("Harga " + p.materialName + " belum berhasil diperbarui. Cek di ERP, menu Bahan & Produk.");
    }

    try {
      result.stock = await addMaterialStock(businessId, p.materialId, qty);
      if (!result.stock) result.warnings.push("Stok " + p.materialName + " belum berhasil diperbarui. Cek di ERP, menu Bahan & Produk.");
    } catch (e) {
      result.stock = null;
      result.warnings.push("Stok " + p.materialName + " belum berhasil diperbarui. Cek di ERP, menu Bahan & Produk.");
    }

    return result;
  }

  // Pembelian bahan yang sudah tercatat lewat kasir, terbaru lebih dulu.
  function purchaseEntries(businessId) {
    requireERP();
    return ERP.getActiveTransactions()
      .filter(function (t) {
        if (t.source !== PURCHASE_SOURCE) return false;
        return businessId ? ERP.idEqual(t.businessId, businessId) : true;
      })
      .slice()
      .sort(function (a, b) {
        const byDate = String(b.date || "").localeCompare(String(a.date || ""));
        if (byDate) return byDate;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  return {
    METHODS: METHODS,
    MAP_KEY: MAP_KEY,
    loadMapping: loadMapping,
    saveMapping: saveMapping,
    guessAccount: guessAccount,
    guessMapping: guessMapping,
    mappingProblems: mappingProblems,
    mappingSummary: mappingSummary,
    hasAnyMapping: hasAnyMapping,
    loadCatalog: loadCatalog,
    syncERP: syncERP,
    postSale: postSale,
    isPosted: isPosted,
    postCash: postCash,
    cashPosted: cashPosted,
    cashEntries: cashEntries,
    PURCHASE_SOURCE: PURCHASE_SOURCE,
    purchaseAccount: purchaseAccount,
    purchaseProblems: purchaseProblems,
    loadMaterials: loadMaterials,
    unitPriceOf: unitPriceOf,
    postPurchase: postPurchase,
    purchasePosted: purchasePosted,
    purchaseEntries: purchaseEntries
  };
})();
