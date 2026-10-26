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
   Stok tidak diubah oleh kasir.
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
    cashEntries: cashEntries
  };
})();
