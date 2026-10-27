/* =====================================================
   KASIR CATAT.IN — BELI BAHAN BAKU
   -----------------------------------------------------
   Sama seperti menu "Beli stok/bahan" di bot Telegram:
   jurnal tercatat ke ERP, harga bahan diperbarui ke harga
   beli terbaru, dan stok bahan bertambah.
   Pembayaran: Tunai / Transfer / QRIS (tanpa bayar nanti).

   Modul ini memakai fungsi global dari index.html:
   $, esc, rp, num, mask, fmt, dstr, toast, ov, cl, setM,
   onlineNow, uid, plain, erpBiz, mapping, saving, render.
   Logika tulis ke ERP ada di PosERP.postPurchase (pos-erp.js).
===================================================== */

let bf = { date: '', mat: '', qty: '', amount: '', method: 'Tunai', note: '', id: '' };
let bahanList = [];
let bahanState = 'idle'; // idle | loading | ready | error
let bahanError = '';

const NO_MAT = '__none';

/* "2", "0,5", "1.5" -> angka desimal; selain itu 0 */
function numDec(s) {
  const t = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if (!t) return 0;
  const norm = /,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return isFinite(n) && n > 0 ? n : 0;
}

function qtyTxt2(n) {
  return String(+Number(n).toFixed(4)).replace('.', ',');
}

function beliMaterial() {
  return bahanList.find(m => m.id === bf.mat) || null;
}

let bahanBiz = '', bahanAt = 0;

function beliInit() {
  if (!bf.date) bf.date = dstr(new Date());
  if (bahanState === 'loading') return;
  // Data masih segar (usaha sama, kurang dari 1 menit): tidak perlu ambil ulang.
  if (bahanState === 'ready' && bahanBiz === erpBiz.id && Date.now() - bahanAt < 60000) return;
  bahanState = 'loading';
  bahanError = '';
  PosERP.loadMaterials(erpBiz.id).then(list => {
    bahanList = list;
    bahanBiz = erpBiz.id;
    bahanAt = Date.now();
    bahanState = 'ready';
    if (!list.some(m => m.id === bf.mat) && bf.mat !== NO_MAT) bf.mat = '';
    if (location.hash === '#beli') render();
  }).catch(e => {
    bahanState = 'error';
    bahanError = ERP.friendlyError ? ERP.friendlyError(e) : String((e && e.message) || e);
    if (location.hash === '#beli') render();
  });
}

function beliMethodOptions() {
  return PosERP.METHODS.map(m => `<option ${bf.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('');
}

function beliMatOptions() {
  const opts = bahanList.map(m => `<option value="${esc(m.id)}" ${bf.mat === m.id ? 'selected' : ''}>${esc(m.name)}${m.unit ? ' (' + esc(m.unit) + ')' : ''}</option>`).join('');
  return `<option value="">-- Pilih bahan --</option>${opts}<option value="${NO_MAT}" ${bf.mat === NO_MAT ? 'selected' : ''}>Bukan bahan di daftar (jurnal saja)</option>`;
}

function beliList() {
  const list = PosERP.purchaseEntries(erpBiz.id).slice(0, 20);
  if (!list.length) return '<p class="mut">Belum ada pembelian bahan yang dicatat dari kasir.</p>';
  return list.map(t => `<div class="li" style="cursor:default"><div><b>${rp(t.amount)}</b><div class="mut">${esc(t.date)} · ${esc(String(t.description || '').replace(/^Beli bahan:\s*/, ''))}</div></div></div>`).join('') +
    '<p class="mut" style="margin-top:8px">Catatan yang sudah tersimpan tidak bisa diubah dari kasir. Kalau ada yang salah, betulkan di Ilham ERP.</p>';
}

function beli() {
  if (bahanState === 'loading' || bahanState === 'idle') {
    return '<h1>Beli Bahan</h1><div class="card"><p class="mut">Memuat daftar bahan…</p></div>';
  }
  if (bahanState === 'error') {
    return `<h1>Beli Bahan</h1><div class="card"><div class="err">${esc(bahanError)}</div><button class="btn" onclick="bahanState='idle';beliInit();render()">Coba lagi</button></div>`;
  }
  const accProblem = PosERP.purchaseProblems(mapping, ERP.getActiveAccounts(), bf.method, erpBiz.id);
  const m = beliMaterial();
  return `<div class="row sp"><h1>Beli Bahan</h1><a class="btn s" href="https://accountingilhamv1.github.io/Ilhamoke/products.html">Kelola bahan di ERP</a></div>
<p class="mut">Catat pembelian bahan baku. Jurnal tercatat otomatis, harga bahan diperbarui ke harga beli terbaru, dan stok bahan bertambah.</p>
${bahanList.length ? '' : '<div class="warn">Belum ada bahan di ERP. Tambahkan dulu di menu Bahan &amp; Produk, atau pilih "Bukan bahan di daftar" untuk mencatat jurnalnya saja.</div>'}
${accProblem.length ? `<div class="warn"><b>Pengaturan belum lengkap.</b> ${esc(accProblem.join(' '))} <a href="#setup" onclick="go('setup')">Buka Pengaturan</a></div>` : ''}
<div class="card">
<label>Bahan yang dibeli</label>
<select id="bmat" onchange="beliSet('mat',this.value)">${beliMatOptions()}</select>
<div id="bhint" class="mut"></div>
<div class="row" style="margin-top:4px">
<div style="flex:1;min-width:140px"><label id="bqtylabel">Jumlah dibeli${m && m.unit ? ' (' + esc(m.unit) + ')' : ''}</label><input id="bqty" inputmode="decimal" autocomplete="off" placeholder="Contoh: 2 atau 0,5" value="${esc(bf.qty)}" oninput="beliSet('qty',this.value)"></div>
<div style="flex:1;min-width:140px"><label>Total bayar (Rp)</label><input id="bamount" inputmode="numeric" autocomplete="off" value="${esc(bf.amount)}" oninput="mask(this);beliSet('amount',this.value)"></div>
</div>
<div class="row"><div style="flex:1;min-width:140px"><label>Tanggal</label><input type="date" id="bdate" value="${esc(bf.date)}" onchange="beliSet('date',this.value)"></div>
<div style="flex:1;min-width:140px"><label>Dibayar dengan</label><select id="bmethod" onchange="beliSet('method',this.value);render()">${beliMethodOptions()}</select></div></div>
<label>Catatan (opsional)</label><input id="bnote" maxlength="80" placeholder="Misalnya: beli di Toko Makmur" value="${esc(bf.note)}" oninput="beliSet('note',this.value)">
<div id="bprev" class="mut" style="margin-top:10px"></div>
<div class="err" id="bmsg"></div>
<div class="row" style="margin-top:10px"><button class="btn" onclick="beliConfirm()">Simpan pembelian</button></div>
</div>
<div class="card"><h2>Pembelian terakhir</h2>${beliList()}</div>`;
}

function beliSet(key, value) {
  bf[key] = value;
  bf.id = ''; // data berubah: nomor transaksi baru dibuat saat konfirmasi
  const err = $('bmsg'); if (err) err.textContent = '';
  if (key === 'mat') {
    const m = beliMaterial();
    const lb = $('bqtylabel');
    if (lb) lb.textContent = 'Jumlah dibeli' + (m && m.unit ? ' (' + m.unit + ')' : '');
  }
  beliPrev();
}

function beliPrev() {
  const e = $('bprev'), h = $('bhint');
  if (!e) return;
  const m = beliMaterial(), qty = numDec(bf.qty), amount = num(bf.amount);
  if (h) {
    h.textContent = m ? 'Harga sekarang ' + rp(m.price) + ' per ' + (m.unit || 'satuan') + ' · stok ' + (m.stock == null ? 'belum diisi' : qtyTxt2(m.stock) + ' ' + (m.unit || '')) : '';
  }
  if (!m || !qty || !amount) { e.innerHTML = ''; return; }
  const unit = PosERP.unitPriceOf(amount, qty);
  const after = (m.stock == null ? 0 : m.stock) + qty;
  e.innerHTML = `Harga baru <b>${rp(unit)}</b> per ${esc(m.unit || 'satuan')}${unit !== m.price ? ' (sebelumnya ' + rp(m.price) + ')' : ''}<br>Stok jadi <b>${qtyTxt2(after)} ${esc(m.unit || '')}</b>`;
}

function beliValidate() {
  const noMat = bf.mat === NO_MAT, m = beliMaterial();
  if (!bf.mat) return 'Pilih bahan yang dibeli.';
  if (!noMat && !m) return 'Bahan tidak ditemukan. Muat ulang halaman.';
  if (!noMat && !numDec(bf.qty)) return 'Jumlah dibeli harus diisi dan lebih dari 0.';
  if (!(num(bf.amount) > 0)) return 'Total bayar harus diisi dan lebih dari 0.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bf.date || '')) return 'Tanggal tidak valid.';
  const problems = PosERP.purchaseProblems(mapping, ERP.getActiveAccounts(), bf.method, erpBiz.id);
  if (problems.length) return problems.join(' ');
  return '';
}

function beliConfirm() {
  const msg = $('bmsg');
  if (!onlineNow()) { if (msg) msg.textContent = 'Tidak ada koneksi internet. Pembelian belum bisa disimpan.'; return; }
  const bad = beliValidate();
  if (bad) { if (msg) msg.textContent = bad; return; }
  if (!bf.id) bf.id = 'BLI-' + bf.date.replace(/-/g, '') + '-' + uid();
  const m = beliMaterial(), qty = numDec(bf.qty), amount = num(bf.amount);
  const acc = PosERP.purchaseAccount(ERP.getActiveAccounts());
  ov(`<h2>Simpan pembelian ini?</h2>
<p><b>${m ? esc(m.name) + ' · ' + qtyTxt2(qty) + ' ' + esc(m.unit || '') : 'Bahan di luar daftar'}</b><br>${esc(bf.date)} · ${rp(amount)} · ${esc(bf.method)}</p>
<p class="mut">Masuk ke akun <b>${esc(acc.code + ' ' + acc.name)}</b>.${m ? '<br>Harga baru ' + rp(PosERP.unitPriceOf(amount, qty)) + ' per ' + esc(m.unit || 'satuan') + ', stok bertambah ' + qtyTxt2(qty) + '.' : '<br>Stok dan harga bahan tidak berubah.'}</p>
<div class="warn">Catatan yang sudah tersimpan tidak bisa diubah dari kasir.</div>
<div class="err" id="km"></div>
<div class="row"><button class="btn" id="bok" onclick="beliSave()">Ya, simpan</button><button class="btn s" onclick="cl()">Batal</button></div>`);
}

async function beliSave() {
  if (saving) return;
  const out = $('km'), btn = $('bok');
  if (!onlineNow()) { if (out) out.textContent = 'Tidak ada koneksi internet. Pembelian belum tersimpan.'; return; }
  const bad = beliValidate();
  if (bad) { if (out) out.textContent = bad; return; }
  const m = beliMaterial(), noMat = bf.mat === NO_MAT;
  const purchase = {
    id: bf.id || ('BLI-' + bf.date.replace(/-/g, '') + '-' + uid()),
    date: bf.date,
    method: bf.method,
    amount: num(bf.amount),
    qty: noMat ? 0 : numDec(bf.qty),
    materialId: noMat ? '' : m.id,
    materialName: noMat ? '' : m.name,
    materialUnit: noMat ? '' : m.unit,
    note: bf.note.trim()
  };
  bf.id = purchase.id;
  saving = true;
  if (btn) btn.disabled = true;
  try {
    const res = await PosERP.postPurchase(erpBiz.id, purchase, mapping);
    if (!res.ok) { if (out) out.textContent = plain((res.errors || ['Pembelian gagal disimpan.']).join(' ')); return; }
    const lines = [];
    if (res.duplicate) lines.push('Pembelian ini sudah tersimpan di ERP.');
    else {
      lines.push('Tercatat di ERP: ' + rp(purchase.amount) + ' (' + purchase.method + ').');
      if (res.priceOk) lines.push('Harga ' + purchase.materialName + ' diperbarui: ' + rp(res.unitPrice) + ' per ' + (purchase.materialUnit || 'satuan') + '.');
      if (res.stock) lines.push('Stok ' + res.stock.name + ' sekarang ' + qtyTxt2(res.stock.stock) + ' ' + res.stock.unit + '.');
    }
    const warn = (res.warnings || []).join(' ');
    bf = { date: dstr(new Date()), mat: '', qty: '', amount: '', method: bf.method, note: '', id: '' };
    bahanState = 'idle';
    bahanAt = 0;
    cl();
    render();
    ov(`<h2>${res.duplicate ? 'Sudah tersimpan' : 'Pembelian tersimpan'}</h2><p class="ok">${lines.map(esc).join('<br>')}</p>${warn ? `<div class="warn">${esc(warn)}</div>` : ''}<button class="btn" onclick="cl()">Tutup</button>`);
  } catch (e) {
    if (out) out.textContent = ERP.friendlyError ? ERP.friendlyError(e) : String((e && e.message) || e);
  } finally {
    saving = false;
    const b2 = $('bok'); if (b2) b2.disabled = false;
  }
}
