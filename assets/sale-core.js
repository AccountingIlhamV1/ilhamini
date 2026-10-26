/* =====================================================
   ILHAM ERP — MESIN PENJUALAN BERSAMA
   -----------------------------------------------------
   Satu sumber aturan untuk mengubah satu penjualan kasir
   menjadi baris jurnal yang dipakai ERP dan POS:

     - Jurnal penjualan:
         Debit  akun metode bayar
         Kredit akun pendapatan
         jumlah = total penjualan
     - Jurnal HPP (opsional, kalau harga modal tersedia):
         Debit  akun HPP
         Kredit akun persediaan
         jumlah = total HPP

   Modul ini TIDAK menyentuh DOM, Supabase, localStorage,
   atau auth. Tugasnya hanya menghitung dan menyusun data.
   Penulisan ke database tetap lewat ERP.createTransactionsRemote.
===================================================== */

window.SaleCore = (function () {
  "use strict";

  function materialOf(materials, id) {
    if (!materials) return null;
    if (typeof materials === "function") return materials(id) || null;
    return materials[id] || null;
  }

  // Sama dengan aturan di halaman Produk: jumlahkan qty x harga bahan.
  function costFromRecipe(rows, materials) {
    let total = 0;
    (rows || []).forEach(function (row) {
      const material = materialOf(materials, row.material_id);
      const qty = typeof row.qty === "number" ? row.qty : Number(row.qty);
      if (material && isFinite(qty)) total += qty * Number(material.price);
    });
    return total;
  }

  // Modal manual menang; kalau tidak ada, hitung dari resep; kalau
  // resep juga kosong, modal belum diketahui (null), bukan nol.
  function costOfProduct(product, recipeRows, materials) {
    if (!product) return null;
    if (product.cost_override !== null && product.cost_override !== undefined) {
      return Number(product.cost_override);
    }
    const rows = recipeRows || [];
    return rows.length ? costFromRecipe(rows, materials) : null;
  }

  // HPP dari baris keranjang. Baris tanpa modal tidak dianggap nol.
  function cogsFromItems(items) {
    let total = 0;
    let missing = 0;
    (items || []).forEach(function (item) {
      if (item.cost === null || item.cost === undefined || item.cost === "") {
        missing += 1;
        return;
      }
      const qty = Number(item.qty);
      const cost = Number(item.cost);
      if (isFinite(qty) && isFinite(cost)) total += qty * cost;
    });
    return { total: total, missing: missing };
  }

  function itemsText(items) {
    return (items || []).map(function (item) {
      return item.name + " x" + item.qty;
    }).join(", ");
  }

  function describeSale(sale) {
    return "Penjualan kasir " + sale.id + ": " + itemsText(sale.items);
  }

  function describeCogs(sale) {
    return "HPP kasir " + sale.id + ": " + itemsText(sale.items);
  }

  function validDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""));
  }

  /* Susun satu penjualan menjadi maksimal dua baris jurnal.
     sale: { id, date, method, total, cogs, items:[{name, qty, cost?}], createdAt? }
     mapping: { [metode]: akunDebit, __revenue, __cogs, __inventory }
     Hasil: { ok, errors, warnings, sales, cogs }
     sales/cogs berbentuk data transaksi ERP, belum punya id database. */
  function buildRows(businessId, sale, mapping, createdAt) {
    const errors = [];
    const warnings = [];
    const map = mapping || {};

    if (!businessId) errors.push("Usaha belum dipilih.");
    if (!sale || typeof sale !== "object") {
      return { ok: false, errors: ["Data penjualan tidak valid."], warnings: warnings, sales: null, cogs: null };
    }

    const id = String(sale.id || "");
    if (!id) errors.push("ID penjualan kosong.");
    if (!validDate(sale.date)) errors.push("Tanggal penjualan tidak valid.");
    if (!Array.isArray(sale.items) || sale.items.length === 0) errors.push("Penjualan tidak punya item.");

    const total = Number(sale.total);
    if (!(total > 0)) errors.push("Total penjualan harus lebih dari nol.");

    const debit = map[sale.method];
    const revenue = map.__revenue;
    if (!debit) errors.push("Akun debit untuk metode " + sale.method + " belum dipilih.");
    if (!revenue) errors.push("Akun pendapatan belum dipilih.");
    if (debit && revenue && String(debit) === String(revenue)) {
      errors.push("Akun debit dan kredit tidak boleh sama.");
    }

    const cogsTotal = Number(sale.cogs) || 0;
    if (cogsTotal < 0) errors.push("Nilai HPP tidak boleh negatif.");
    const cogsAccount = map.__cogs;
    const inventoryAccount = map.__inventory;
    const cogsReady = !!(cogsAccount && inventoryAccount && String(cogsAccount) !== String(inventoryAccount));
    if (cogsTotal > 0 && !cogsReady) {
      warnings.push("Akun HPP/Persediaan belum dipilih atau sama; HPP tidak dicatat.");
    }

    if (errors.length) {
      return { ok: false, errors: errors, warnings: warnings, sales: null, cogs: null };
    }

    const stamp = createdAt || new Date().toISOString();
    const sales = {
      businessId: businessId,
      date: sale.date,
      invoice: id,
      description: describeSale(sale),
      debitAccountId: debit,
      creditAccountId: revenue,
      amount: total,
      sourceId: id,
      source: "catatin",
      createdAt: stamp
    };

    let cogs = null;
    if (cogsTotal > 0 && cogsReady) {
      cogs = {
        businessId: businessId,
        date: sale.date,
        invoice: id,
        description: describeCogs(sale),
        debitAccountId: cogsAccount,
        creditAccountId: inventoryAccount,
        amount: cogsTotal,
        sourceId: id,
        source: "catatin-hpp",
        createdAt: stamp
      };
    }

    return { ok: true, errors: [], warnings: warnings, sales: sales, cogs: cogs };
  }

  return {
    costFromRecipe: costFromRecipe,
    costOfProduct: costOfProduct,
    cogsFromItems: cogsFromItems,
    itemsText: itemsText,
    describeSale: describeSale,
    describeCogs: describeCogs,
    buildRows: buildRows
  };
})();
