/* =====================================================
   KASIR CATAT.IN — BELI BAHAN BAKU
   -----------------------------------------------------
   Sama seperti menu "Beli stok/bahan" di bot Telegram:
   jurnal tercatat ke ERP, harga bahan diperbarui ke harga
   beli terbaru, dan stok bahan bertambah.
   Pembayaran: Tunai / Transfer / QRIS (tanpa bayar nanti).
   Ada juga baca foto nota (fungsi server nota-scan, Gemini).

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
${notaCard()}
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


/* =====================================================
   FOTO NOTA
   Foto dikecilkan di browser, dikirim ke fungsi server
   "nota-scan" (kunci Gemini ada di server), hasilnya
   diperiksa dulu sebelum disimpan, sama seperti di bot.
===================================================== */

let nt = null, ntBusy = false, ntErr = '';

function ntWords(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
}

function ntUnit(u) {
  const x = String(u || '').toLowerCase().replace(/[^a-z]/g, '');
  if (['kg', 'kilo', 'kilogram'].includes(x)) return 'kg';
  if (['g', 'gr', 'gram'].includes(x)) return 'g';
  if (['l', 'lt', 'liter', 'ltr'].includes(x)) return 'l';
  if (['bks', 'bungkus', 'pak', 'pack'].includes(x)) return 'bks';
  return x;
}

function ntNum(v) {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && isFinite(n) ? n : null;
}

/* Bahan yang paling mirip dengan nama barang di nota; null kalau tidak cukup mirip. */
function ntMatch(name, mats) {
  const a = ntWords(name);
  if (!a.length) return null;
  let best = null, bestScore = 0;
  for (const m of mats) {
    const b = ntWords(m.name);
    if (!b.length) continue;
    const common = a.filter(w => b.includes(w)).length;
    if (!common) continue;
    const score = common / Math.max(a.length, b.length);
    if (score > bestScore) { best = m; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

/* Satu barang nota -> { name, qty, unit, price, match, status } */
function ntItem(it, mats) {
  const qty = ntNum(it.qty), price = ntNum(it.price_total);
  const m = ntMatch(it.name, mats);
  let status = 'none';
  if (m) {
    if (it.unit && m.unit && ntUnit(it.unit) !== ntUnit(m.unit)) status = 'unit';
    else if (qty !== null && qty > 0 && price !== null) status = 'ok';
    else status = 'nodata';
  }
  const ok = status === 'ok';
  return {
    name: String(it.name || '').slice(0, 60), qty, unit: it.unit || '', price,
    matId: ok ? m.id : null, matName: ok ? m.name : null, matUnit: ok ? m.unit : null,
    status, hint: m ? m.name : '', hintUnit: m ? m.unit : ''
  };
}

function notaImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const M = 1600, k = Math.min(1, M / Math.max(im.width, im.height));
      const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibuka.')); };
    im.src = url;
  });
}

async function notaFnError(error) {
  try {
    if (error && error.context && typeof error.context.json === 'function') {
      const j = await error.context.json();
      if (j && j.error) return String(j.error);
    }
  } catch (e) { /* pakai pesan bawaan */ }
  const msg = String((error && error.message) || error || '');
  if (/failed to fetch|network|relay/i.test(msg)) return 'Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.';
  return msg || 'Nota belum bisa dibaca. Coba lagi.';
}

async function notaPick(el) {
  const f = el.files && el.files[0];
  if (!f) return;
  ntErr = '';
  if (!onlineNow()) { el.value = ''; ntErr = 'Tidak ada koneksi internet. Nota belum bisa dibaca.'; render(); return; }
  if (!/^image\//i.test(f.type)) { el.value = ''; ntErr = 'File harus berupa gambar.'; render(); return; }
  if (f.size > 20 * 1024 * 1024) { el.value = ''; ntErr = 'Ukuran foto maksimal 20 MB.'; render(); return; }
  ntBusy = true; render();
  try {
    const image = await notaImage(f);
    const res = await ERPAuth.client.functions.invoke('nota-scan', { body: { image, mime: 'image/jpeg' } });
    if (res.error) throw Object.assign(new Error(await notaFnError(res.error)), { shown: true });
    const d = res.data || {};
    if (d.error) throw Object.assign(new Error(String(d.error)), { shown: true });
    if (!d.is_receipt) { ntErr = 'Gambar ini tidak terlihat seperti nota. Coba foto ulang.'; return; }
    const total = ntNum(d.total);
    if (total === null || total <= 0) { ntErr = 'Total nota tidak terbaca. Coba foto ulang dengan cahaya cukup dan nota rata.'; return; }
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 15).map(it => ntItem(it, bahanList));
    nt = {
      id: 'NTA-' + dstr(new Date()).replace(/-/g, '') + '-' + uid(),
      merchant: d.merchant ? String(d.merchant).slice(0, 60) : '',
      date: typeof d.date === 'string' ? d.date : '',
      total, items, method: bf.method
    };
  } catch (e) {
    ntErr = (e && e.shown) ? e.message : (ERP.friendlyError ? ERP.friendlyError(e) : String((e && e.message) || e));
  } finally {
    ntBusy = false;
    el.value = '';
    if (location.hash === '#beli') render();
  }
}

function notaCard() {
  if (ntBusy) return '<div class="card"><h2>Foto nota</h2><p class="mut">Membaca nota, tunggu sebentar…</p></div>';
  if (nt) return notaReview();
  return `<div class="card"><h2>Foto nota</h2><p class="mut">Foto nota belanja bahan, lalu barang dan totalnya dibaca otomatis. Hasilnya diperiksa dulu sebelum disimpan. Harga dan stok bahan yang cocok ikut diperbarui.</p><input type="file" id="ntfile" accept="image/*" onchange="notaPick(this)"><div class="err">${esc(ntErr)}</div></div>`;
}

function notaItemHtml(it) {
  const q = it.qty !== null ? qtyTxt2(it.qty) + (it.unit ? ' ' + esc(it.unit) : '') + ' ' : '';
  const line = `${q}${esc(it.name)}${it.price !== null ? ' — ' + rp(it.price) : ''}`;
  let note;
  if (it.status === 'ok') note = `<span class="ok">cocok: ${esc(it.matName)}, harga jadi ${rp(PosERP.unitPriceOf(it.price, it.qty))} per ${esc(it.matUnit || 'satuan')}, stok +${qtyTxt2(it.qty)}</span>`;
  else if (it.status === 'unit') note = `mirip ${esc(it.hint)}, tapi satuan beda (nota ${esc(it.unit)}, bahan ${esc(it.hintUnit)}). Stok tidak diubah.`;
  else if (it.status === 'nodata') note = `cocok: ${esc(it.hint)}, tapi jumlah atau harga tidak terbaca. Stok tidak diubah.`;
  else note = 'belum ada di daftar bahan. Stok tidak diubah.';
  return `<div class="ci"><div>${line}</div><div class="mut">➜ ${note}</div></div>`;
}

function notaReview() {
  const problems = PosERP.purchaseProblems(mapping, ERP.getActiveAccounts(), nt.method, erpBiz.id);
  const today = dstr(new Date());
  const day = /^\d{4}-\d{2}-\d{2}$/.test(nt.date || '') && nt.date <= today ? nt.date : today;
  return `<div class="card"><h2>Nota terbaca (belum disimpan)</h2>
<p class="mut">Toko: <b>${esc(nt.merchant || 'tidak terbaca')}</b><br>Tanggal: <b>${esc(day)}</b>${day !== nt.date ? ' (tanggal nota tidak terbaca atau di masa depan, dipakai hari ini)' : ''}</p>
${nt.items.length ? nt.items.map(notaItemHtml).join('') : '<p class="mut">Tidak ada barang yang terbaca. Hanya total yang akan dicatat.</p>'}
<label>Total nota (Rp)</label><input id="nttotal" inputmode="numeric" autocomplete="off" value="${fmt(nt.total)}" oninput="mask(this);nt.total=num(this.value)">
<label>Dibayar dengan</label><select onchange="nt.method=this.value;render()">${PosERP.METHODS.map(m => `<option ${nt.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
${problems.length ? `<div class="warn" style="margin-top:10px"><b>Pengaturan belum lengkap.</b> ${esc(problems.join(' '))} <a href="#setup" onclick="go('setup')">Buka Pengaturan</a></div>` : ''}
<p class="mut">Periksa dulu. Kalau total atau barang salah, batalkan lalu foto ulang.</p>
<div class="err" id="ntmsg"></div>
<div class="row"><button class="btn" ${problems.length ? 'disabled' : ''} onclick="notaSave(false)">Simpan nota</button><button class="btn s" onclick="notaCancel()">Batal</button></div></div>`;
}

function notaCancel() { nt = null; ntErr = ''; render(); }

async function notaSave(force) {
  if (saving || !nt) return;
  const msg = $('ntmsg');
  const fail = t => { if (msg) msg.textContent = t; else toast(t); };
  if (!onlineNow()) return fail('Tidak ada koneksi internet. Nota belum tersimpan.');
  if (!(Number(nt.total) > 0)) return fail('Total nota harus diisi dan lebih dari 0.');
  saving = true;
  cl();
  try {
    const res = await PosERP.postNota(erpBiz.id, nt, mapping, { force: !!force });
    if (res.needConfirm) {
      saving = false;
      ov(`<h2>Nota ini sudah pernah tersimpan?</h2><p>Sudah ada catatan dengan toko, tanggal, dan total yang sama (${esc(nt.merchant || 'toko tidak terbaca')}, ${esc(res.date)}, ${rp(Math.round(nt.total))}).</p><p class="mut">Kalau ini pembelian yang berbeda, pilih Tetap simpan.</p><div class="row"><button class="btn" onclick="cl();notaSave(true)">Tetap simpan</button><button class="btn s" onclick="cl()">Batal</button></div>`);
      return;
    }
    if (!res.ok) return fail(plain((res.errors || ['Nota gagal disimpan.']).join(' ')));
    const lines = [];
    if (res.duplicate) lines.push('Nota ini sudah tersimpan di ERP.');
    else {
      lines.push('Nota tersimpan di ERP: ' + res.desc + ' — ' + rp(Math.round(nt.total)) + ' (' + nt.method + ').');
      res.lines.forEach(l => lines.push('• ' + l.name + ': ' + (l.priceOk ? rp(l.unitPrice) + ' per ' + (l.unit || 'satuan') : 'harga belum berhasil diperbarui') + (l.stock ? ', stok ' + qtyTxt2(l.stock.stock) + ' ' + l.stock.unit : '')));
      if (res.skipped.length) lines.push('Tidak mengubah stok: ' + res.skipped.join(', ') + '. Nominalnya tetap masuk total.');
    }
    const warn = (res.warnings || []).join(' ');
    nt = null; ntErr = '';
    bahanState = 'idle'; bahanAt = 0;
    render();
    ov(`<h2>${res.duplicate ? 'Sudah tersimpan' : 'Nota tersimpan'}</h2><p class="ok">${lines.map(esc).join('<br>')}</p>${warn ? `<div class="warn">${esc(warn)}</div>` : ''}<button class="btn" onclick="cl()">Tutup</button>`);
  } catch (e) {
    fail(ERP.friendlyError ? ERP.friendlyError(e) : String((e && e.message) || e));
  } finally {
    saving = false;
  }
}
