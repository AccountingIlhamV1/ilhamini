/* =====================================================
   CATAT.IN KASIR — PROTOTIPE TAHAP 1
   -----------------------------------------------------
   Semua data produk di bawah adalah DATA CONTOH.
   File ini sengaja tidak memuat Supabase client, tidak
   melakukan fetch, dan tidak menulis ke database.

   Kontrak produk mengikuti field yang sudah dipakai
   IlhamERP di tabel `products`:
     id, name, sell_price, active
   Field category, emoji, tint, dan stock hanya metadata
   tampilan untuk prototipe ini.

   Checkout belum diimplementasikan ke backend. Rencana
   payload mengikuti pola `transactions` IlhamERP (satu
   debit + satu kredit, penanda di raw_input), tetapi
   schema, constraint, dan RLS belum diverifikasi.
===================================================== */

(function () {
  "use strict";

  const PRODUCTS = [
    { id: "demo-nasi-goreng", name: "Nasi Goreng", category: "Makanan", sell_price: 15000, emoji: "🍛", tint: "#fff3df", stock: 18, active: true },
    { id: "demo-ayam-geprek", name: "Ayam Geprek", category: "Makanan", sell_price: 18000, emoji: "🍗", tint: "#ffe9df", stock: 12, active: true },
    { id: "demo-mie-goreng", name: "Mie Goreng", category: "Makanan", sell_price: 14000, emoji: "🍜", tint: "#fff0da", stock: 9, active: true },
    { id: "demo-sate-ayam", name: "Sate Ayam", category: "Makanan", sell_price: 22000, emoji: "🍢", tint: "#f2e9dd", stock: 6, active: true },
    { id: "demo-es-teh", name: "Es Teh Manis", category: "Minuman", sell_price: 5000, emoji: "🧋", tint: "#e4f3ef", stock: 40, active: true },
    { id: "demo-es-jeruk", name: "Es Jeruk", category: "Minuman", sell_price: 7000, emoji: "🍊", tint: "#fff0dc", stock: 25, active: true },
    { id: "demo-kopi-hitam", name: "Kopi Hitam", category: "Minuman", sell_price: 8000, emoji: "☕", tint: "#f1e8e0", stock: 20, active: true },
    { id: "demo-pisang-goreng", name: "Pisang Goreng", category: "Camilan", sell_price: 10000, emoji: "🍌", tint: "#fff7d6", stock: 15, active: true },
    { id: "demo-keripik", name: "Keripik Singkong", category: "Camilan", sell_price: 8000, emoji: "🥔", tint: "#f3eee4", stock: 0, active: true },
    { id: "demo-air-mineral", name: "Air Mineral", category: "Minuman", sell_price: 4000, emoji: "💧", tint: "#e7f2fb", stock: 50, active: true }
  ];

  const CATEGORIES = ["Semua", "Makanan", "Minuman", "Camilan"];
  const numberFormat = new Intl.NumberFormat("id-ID");
  const mobileQuery = window.matchMedia("(max-width: 980px)");

  const state = {
    category: "Semua",
    query: "",
    cart: new Map(),
    method: "Tunai",
    cashReceived: 0
  };

  const els = {
    todayLabel: document.getElementById("todayLabel"),
    search: document.getElementById("productSearch"),
    clearSearch: document.getElementById("clearSearch"),
    categoryChips: document.getElementById("categoryChips"),
    resultCount: document.getElementById("resultCount"),
    productGrid: document.getElementById("productGrid"),
    productEmpty: document.getElementById("productEmpty"),
    resetFilters: document.getElementById("resetFilters"),
    cartPanel: document.getElementById("cartPanel"),
    cartCount: document.getElementById("cartCount"),
    clearCart: document.getElementById("clearCart"),
    closeCart: document.getElementById("closeCart"),
    cartScroll: document.getElementById("cartScroll"),
    cartEmpty: document.getElementById("cartEmpty"),
    cartItems: document.getElementById("cartItems"),
    subtotalValue: document.getElementById("subtotalValue"),
    totalValue: document.getElementById("totalValue"),
    summaryNote: document.getElementById("summaryNote"),
    payButton: document.getElementById("payButton"),
    mobileCartBar: document.getElementById("mobileCartBar"),
    mobileCount: document.getElementById("mobileCount"),
    mobileItemLabel: document.getElementById("mobileItemLabel"),
    mobileTotal: document.getElementById("mobileTotal"),
    sheetBackdrop: document.getElementById("sheetBackdrop"),
    toast: document.getElementById("toast"),
    paymentModal: document.getElementById("paymentModal"),
    closePayment: document.getElementById("closePayment"),
    paymentView: document.getElementById("paymentView"),
    paymentTotal: document.getElementById("paymentTotal"),
    paymentItems: document.getElementById("paymentItems"),
    methodGrid: document.getElementById("methodGrid"),
    cashBox: document.getElementById("cashBox"),
    cashReceived: document.getElementById("cashReceived"),
    quickCash: document.getElementById("quickCash"),
    changeRow: document.getElementById("changeRow"),
    changeValue: document.getElementById("changeValue"),
    methodNote: document.getElementById("methodNote"),
    confirmPayment: document.getElementById("confirmPayment"),
    successView: document.getElementById("successView"),
    receiptId: document.getElementById("receiptId"),
    receiptTime: document.getElementById("receiptTime"),
    receiptMethod: document.getElementById("receiptMethod"),
    receiptItems: document.getElementById("receiptItems"),
    receiptTotal: document.getElementById("receiptTotal"),
    receiptCashRow: document.getElementById("receiptCashRow"),
    receiptCash: document.getElementById("receiptCash"),
    receiptChangeRow: document.getElementById("receiptChangeRow"),
    receiptChange: document.getElementById("receiptChange"),
    newTransaction: document.getElementById("newTransaction"),
    closeSuccess: document.getElementById("closeSuccess")
  };

  let toastTimer = null;

  /* ---------- BANTU ---------- */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }

  function rupiah(value) {
    return "Rp " + numberFormat.format(Math.max(0, Math.round(Number(value) || 0)));
  }

  function formatToday() {
    return new Date().toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function formatTime(date) {
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }) + " · " + date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function productById(id) {
    return PRODUCTS.find(function (product) { return product.id === id; }) || null;
  }

  function roundUp(value, step) {
    return Math.ceil(value / step) * step;
  }

  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("is-visible");
    }, 1900);
  }

  /* ---------- KERANJANG ---------- */

  function cartItems() {
    const items = [];
    state.cart.forEach(function (qty, id) {
      const product = productById(id);
      if (product && qty > 0) items.push({ product: product, qty: qty });
    });
    return items;
  }

  function cartCount() {
    let total = 0;
    state.cart.forEach(function (qty) { total += qty; });
    return total;
  }

  function cartSubtotal() {
    return cartItems().reduce(function (sum, item) {
      return sum + item.product.sell_price * item.qty;
    }, 0);
  }

  function cartTotal() {
    // Tahap 1 belum memakai diskon, pajak, atau biaya layanan.
    return cartSubtotal();
  }

  function addToCart(id) {
    const product = productById(id);
    if (!product || product.stock <= 0) return;

    const current = state.cart.get(id) || 0;
    if (current >= product.stock) {
      showToast("Stok contoh " + product.name + " tinggal " + product.stock + ".");
      return;
    }

    state.cart.set(id, current + 1);
    renderCart();
    syncProductCards();
    showToast(product.name + " ditambahkan ke keranjang.");
  }

  function changeQty(id, delta) {
    const product = productById(id);
    if (!product) return;

    const current = state.cart.get(id) || 0;
    const next = current + delta;

    if (next <= 0) {
      state.cart.delete(id);
    } else if (next > product.stock) {
      showToast("Stok contoh " + product.name + " tinggal " + product.stock + ".");
      return;
    } else {
      state.cart.set(id, next);
    }

    renderCart();
    syncProductCards();
  }

  function removeFromCart(id) {
    const product = productById(id);
    if (!product) return;
    state.cart.delete(id);
    renderCart();
    syncProductCards();
    showToast(product.name + " dihapus dari keranjang.");
  }

  function clearCart() {
    if (!cartCount()) return;
    if (!window.confirm("Kosongkan semua item dari keranjang?")) return;
    state.cart.clear();
    renderCart();
    syncProductCards();
    showToast("Keranjang dikosongkan.");
  }

  /* ---------- TAMPILAN PRODUK ---------- */

  function renderCategories() {
    els.categoryChips.innerHTML = CATEGORIES.map(function (category) {
      const active = category === state.category;
      return '<button class="chip' + (active ? " is-active" : "") + '" type="button" ' +
        'aria-pressed="' + active + '" data-category="' + escapeHTML(category) + '">' +
        escapeHTML(category) + "</button>";
    }).join("");
  }

  function filteredProducts() {
    return PRODUCTS.filter(function (product) {
      if (product.active === false) return false;
      if (state.category !== "Semua" && product.category !== state.category) return false;
      if (state.query && product.name.toLowerCase().indexOf(state.query) === -1) return false;
      return true;
    });
  }

  function productCard(product) {
    const qty = state.cart.get(product.id) || 0;
    const out = product.stock <= 0;
    const low = !out && product.stock <= 5;
    const stockClass = out ? " out" : (low ? " low" : "");
    const stockText = out ? "Habis" : "Sisa " + product.stock;
    const label = out
      ? product.name + ", stok habis"
      : "Tambah " + product.name + ", " + rupiah(product.sell_price);

    return '<button class="product-card' + (qty > 0 ? " in-cart" : "") + '" type="button" ' +
      'data-add="' + escapeHTML(product.id) + '" ' +
      'style="--tint:' + escapeHTML(product.tint) + '" ' +
      'aria-label="' + escapeHTML(label) + '"' + (out ? " disabled" : "") + ">" +
      '<span class="product-media">' +
        '<span class="stock-pill' + stockClass + '">' + escapeHTML(stockText) + "</span>" +
        '<span class="product-emoji" aria-hidden="true">' + product.emoji + "</span>" +
        '<span class="qty-badge" data-qty-for="' + escapeHTML(product.id) + '"' + (qty > 0 ? "" : " hidden") + ">" + qty + "</span>" +
      "</span>" +
      '<span class="product-body">' +
        '<span class="product-category">' + escapeHTML(product.category) + "</span>" +
        '<span class="product-name">' + escapeHTML(product.name) + "</span>" +
        '<span class="product-bottom">' +
          '<span class="product-price">' + rupiah(product.sell_price) + "</span>" +
          '<span class="product-add' + (out ? " is-out" : "") + '" aria-hidden="true">' + (out ? "Habis" : "+") + "</span>" +
        "</span>" +
      "</span>" +
    "</button>";
  }

  function renderProducts() {
    const products = filteredProducts();
    els.productGrid.innerHTML = products.map(productCard).join("");
    els.productGrid.hidden = products.length === 0;
    els.productEmpty.hidden = products.length > 0;

    const label = products.length + " produk";
    els.resultCount.textContent = state.query ? label + " ditemukan" : label;
  }

  function syncProductCards() {
    document.querySelectorAll(".product-card").forEach(function (card) {
      const id = card.getAttribute("data-add");
      const qty = state.cart.get(id) || 0;
      const badge = card.querySelector("[data-qty-for]");

      card.classList.toggle("in-cart", qty > 0);
      if (badge) {
        badge.textContent = qty;
        badge.hidden = qty === 0;
      }
    });
  }

  /* ---------- TAMPILAN KERANJANG ---------- */

  function cartItemHTML(item) {
    const product = item.product;
    const lineTotal = product.sell_price * item.qty;

    return '<div class="cart-item" style="--tint:' + escapeHTML(product.tint) + '">' +
      '<div class="cart-thumb" aria-hidden="true">' + product.emoji + "</div>" +
      '<div class="cart-info">' +
        '<span class="cart-name">' + escapeHTML(product.name) + "</span>" +
        '<span class="cart-unit">' + rupiah(product.sell_price) + " / item</span>" +
      "</div>" +
      '<div class="cart-line-total">' + rupiah(lineTotal) + "</div>" +
      '<div class="cart-actions-row">' +
        '<div class="qty-control" aria-label="Jumlah ' + escapeHTML(product.name) + '">' +
          '<button class="qty-btn" type="button" data-dec="' + escapeHTML(product.id) + '" aria-label="Kurangi ' + escapeHTML(product.name) + '">−</button>' +
          '<span class="qty-value">' + item.qty + "</span>" +
          '<button class="qty-btn" type="button" data-inc="' + escapeHTML(product.id) + '" aria-label="Tambah ' + escapeHTML(product.name) + '">+</button>' +
        "</div>" +
        '<button class="remove-btn" type="button" data-remove="' + escapeHTML(product.id) + '" aria-label="Hapus ' + escapeHTML(product.name) + ' dari keranjang">Hapus</button>' +
      "</div>" +
    "</div>";
  }

  function renderCart() {
    const items = cartItems();
    const count = cartCount();
    const total = cartTotal();
    const itemLabel = count + " item";

    els.cartItems.innerHTML = items.map(cartItemHTML).join("");
    els.cartEmpty.hidden = count > 0;
    els.cartCount.textContent = itemLabel;
    els.clearCart.disabled = count === 0;

    els.subtotalValue.textContent = rupiah(total);
    els.totalValue.textContent = rupiah(total);
    els.summaryNote.textContent = count
      ? count + " item · belum ada pajak atau biaya tambahan."
      : "Belum ada item.";

    els.payButton.disabled = count === 0;
    els.payButton.setAttribute("aria-label", count
      ? "Bayar sekarang, total " + rupiah(total)
      : "Bayar sekarang, keranjang masih kosong");

    els.mobileCartBar.hidden = count === 0;
    els.mobileCount.textContent = count;
    els.mobileItemLabel.textContent = itemLabel;
    els.mobileTotal.textContent = rupiah(total);

    if (count === 0 && document.body.classList.contains("cart-open")) {
      document.body.classList.remove("cart-open");
      els.sheetBackdrop.classList.remove("is-visible");
      const firstProduct = document.querySelector(".product-card:not(:disabled)");
      if (firstProduct) firstProduct.focus();
      else els.search.focus();
    }
  }

  /* ---------- KERANJANG MOBILE ---------- */

  function openCart() {
    if (!cartCount() || !mobileQuery.matches) return;
    document.body.classList.add("cart-open");
    els.sheetBackdrop.classList.add("is-visible");
    els.closeCart.focus();
  }

  function closeCart() {
    if (!document.body.classList.contains("cart-open")) return;
    document.body.classList.remove("cart-open");
    els.sheetBackdrop.classList.remove("is-visible");
    if (mobileQuery.matches) els.mobileCartBar.focus();
  }

  /* ---------- PEMBAYARAN (SIMULASI) ---------- */

  function setMethod(method) {
    state.method = method;
    renderPayment();
  }

  function syncQuickCash() {
    const total = cartTotal();
    const values = [total, roundUp(total, 20000), roundUp(total, 50000), roundUp(total, 100000)]
      .filter(function (value, index, list) {
        return value > 0 && list.indexOf(value) === index;
      })
      .slice(0, 4);

    els.quickCash.innerHTML = values.map(function (value, index) {
      return '<button type="button" data-cash="' + value + '">' +
        (index === 0 ? "Uang pas" : rupiah(value)) +
      "</button>";
    }).join("");
  }

  function updateChange() {
    const total = cartTotal();
    const received = state.cashReceived;

    els.changeRow.classList.remove("is-under", "is-over");

    if (state.method !== "Tunai") {
      els.changeValue.textContent = rupiah(0);
      els.confirmPayment.disabled = total <= 0;
      return;
    }

    if (received <= 0) {
      els.changeValue.textContent = rupiah(0);
    } else if (received < total) {
      els.changeRow.classList.add("is-under");
      els.changeValue.textContent = "Kurang " + rupiah(total - received);
    } else {
      els.changeRow.classList.add("is-over");
      els.changeValue.textContent = rupiah(received - total);
    }

    els.confirmPayment.disabled = received < total;
  }

  function renderPayment() {
    const total = cartTotal();
    const count = cartCount();

    els.paymentTotal.textContent = rupiah(total);
    els.paymentItems.textContent = count + " item";

    els.methodGrid.querySelectorAll("[data-method]").forEach(function (button) {
      const active = button.getAttribute("data-method") === state.method;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const cash = state.method === "Tunai";
    els.cashBox.hidden = !cash;

    if (cash) {
      els.methodNote.hidden = true;
    } else {
      els.methodNote.hidden = false;
      els.methodNote.textContent = state.method === "QRIS"
        ? "Mode simulasi: tidak ada kode QR yang dibuat dan tidak ada pembayaran yang diproses."
        : "Mode simulasi: tidak ada instruksi transfer atau nomor rekening yang ditampilkan.";
    }

    syncQuickCash();
    updateChange();
  }

  function openPayment() {
    if (!cartCount()) return;

    state.method = "Tunai";
    state.cashReceived = 0;
    els.cashReceived.value = "";

    if (document.body.classList.contains("cart-open")) closeCart();

    els.paymentView.hidden = false;
    els.successView.hidden = true;
    els.paymentModal.hidden = false;
    document.body.classList.add("modal-open");

    renderPayment();
    els.paymentModal.querySelector(".modal-card").scrollTop = 0;
    setTimeout(function () { els.closePayment.focus(); }, 0);
  }

  function closePayment() {
    if (els.paymentModal.hidden) return;

    els.paymentModal.hidden = true;
    document.body.classList.remove("modal-open");

    if (cartCount() && mobileQuery.matches) {
      els.mobileCartBar.focus();
    } else if (cartCount()) {
      els.payButton.focus();
    } else {
      const firstProduct = document.querySelector(".product-card:not(:disabled)");
      if (firstProduct) firstProduct.focus();
      else els.search.focus();
    }
  }

  function makeReceiptId() {
    const now = new Date();
    const date = [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("");
    const random = String(Math.floor(1000 + Math.random() * 9000));
    return "SIM-" + date + "-" + random;
  }

  function confirmPayment() {
    const total = cartTotal();
    const count = cartCount();
    if (!count) return;

    if (state.method === "Tunai" && state.cashReceived < total) {
      showToast("Uang yang diterima masih kurang.");
      return;
    }

    const now = new Date();
    const received = state.method === "Tunai" ? state.cashReceived : null;
    const change = received === null ? null : received - total;

    const receipt = {
      id: makeReceiptId(),
      time: formatTime(now),
      method: state.method,
      count: count,
      total: total,
      received: received,
      change: change
    };

    state.cart.clear();
    renderCart();
    syncProductCards();
    renderSuccess(receipt);
  }

  function renderSuccess(receipt) {
    els.receiptId.textContent = receipt.id;
    els.receiptTime.textContent = receipt.time;
    els.receiptMethod.textContent = receipt.method;
    els.receiptItems.textContent = receipt.count + " item";
    els.receiptTotal.textContent = rupiah(receipt.total);

    const cash = receipt.method === "Tunai";
    els.receiptCashRow.hidden = !cash;
    els.receiptChangeRow.hidden = !cash;
    els.receiptCash.textContent = cash ? rupiah(receipt.received) : "-";
    els.receiptChange.textContent = cash ? rupiah(receipt.change) : "-";

    els.paymentView.hidden = true;
    els.successView.hidden = false;
    els.paymentModal.querySelector(".modal-card").scrollTop = 0;
    setTimeout(function () { els.newTransaction.focus(); }, 0);
  }

  function resetToCatalog() {
    els.search.value = "";
    state.query = "";
    els.clearSearch.hidden = true;
    renderProducts();
    closePayment();
  }

  /* ---------- EVENT ---------- */

  els.todayLabel.textContent = formatToday();

  els.categoryChips.addEventListener("click", function (event) {
    const chip = event.target.closest("[data-category]");
    if (!chip) return;
    state.category = chip.getAttribute("data-category");
    renderCategories();
    renderProducts();
  });

  els.search.addEventListener("input", function () {
    state.query = els.search.value.trim().toLowerCase();
    els.clearSearch.hidden = els.search.value.length === 0;
    renderProducts();
  });

  els.clearSearch.addEventListener("click", function () {
    els.search.value = "";
    state.query = "";
    els.clearSearch.hidden = true;
    els.search.focus();
    renderProducts();
  });

  els.resetFilters.addEventListener("click", function () {
    els.search.value = "";
    state.query = "";
    state.category = "Semua";
    els.clearSearch.hidden = true;
    renderCategories();
    renderProducts();
    els.search.focus();
  });

  els.productGrid.addEventListener("click", function (event) {
    const card = event.target.closest("[data-add]");
    if (!card || card.disabled) return;
    addToCart(card.getAttribute("data-add"));
  });

  els.cartItems.addEventListener("click", function (event) {
    const plus = event.target.closest("[data-inc]");
    const minus = event.target.closest("[data-dec]");
    const remove = event.target.closest("[data-remove]");

    if (plus) {
      changeQty(plus.getAttribute("data-inc"), 1);
    } else if (minus) {
      changeQty(minus.getAttribute("data-dec"), -1);
    } else if (remove) {
      removeFromCart(remove.getAttribute("data-remove"));
    }
  });

  els.clearCart.addEventListener("click", clearCart);
  els.mobileCartBar.addEventListener("click", openCart);
  els.closeCart.addEventListener("click", closeCart);
  els.sheetBackdrop.addEventListener("click", closeCart);
  els.payButton.addEventListener("click", openPayment);
  els.closePayment.addEventListener("click", closePayment);
  els.closeSuccess.addEventListener("click", closePayment);
  els.newTransaction.addEventListener("click", resetToCatalog);

  els.paymentModal.addEventListener("click", function (event) {
    if (event.target.hasAttribute("data-close-payment")) closePayment();
  });

  els.methodGrid.addEventListener("click", function (event) {
    const button = event.target.closest("[data-method]");
    if (button) setMethod(button.getAttribute("data-method"));
  });

  els.cashReceived.addEventListener("input", function () {
    const digits = els.cashReceived.value.replace(/\D/g, "");
    state.cashReceived = digits ? Number(digits) : 0;
    els.cashReceived.value = digits ? numberFormat.format(state.cashReceived) : "";
    updateChange();
  });

  els.quickCash.addEventListener("click", function (event) {
    const button = event.target.closest("[data-cash]");
    if (!button) return;
    state.cashReceived = Number(button.getAttribute("data-cash")) || 0;
    els.cashReceived.value = numberFormat.format(state.cashReceived);
    updateChange();
  });

  els.confirmPayment.addEventListener("click", confirmPayment);

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;

    if (!els.paymentModal.hidden) {
      closePayment();
    } else if (document.body.classList.contains("cart-open")) {
      closeCart();
    }
  });

  els.paymentModal.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;

    const focusables = Array.prototype.filter.call(
      els.paymentModal.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]'),
      function (el) { return el.offsetParent !== null; }
    );

    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener("resize", function () {
    if (!mobileQuery.matches && document.body.classList.contains("cart-open")) {
      closeCart();
    }
  });

  /* ---------- MULAI ---------- */

  renderCategories();
  renderProducts();
  renderCart();
})();
