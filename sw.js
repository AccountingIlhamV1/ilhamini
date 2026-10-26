/* =====================================================
   KASIR CATAT.IN — SERVICE WORKER (PWA)
   -----------------------------------------------------
   Tugasnya hanya menyimpan "kerangka" aplikasi kasir
   supaya bisa dibuka dari layar utama dan tetap tampil
   saat koneksi sedang buruk.

   Yang TIDAK dilakukan:
   - tidak menyimpan/ meniru data transaksi;
   - tidak men-cache request ke Supabase;
   - tidak menyentuh halaman ERP di repo lain.
   Penjualan tetap harus tersambung ke ERP untuk disimpan.
===================================================== */

const VERSION = "2026-10-27.8";
const CACHE = "catatin-pos-" + VERSION;

const SW_URL = new URL(self.location.href);
const BASE = new URL("./", SW_URL);
const ASSETS = new URL("assets/", BASE);

const CORE = [
  BASE.href,
  new URL("index.html", BASE).href,
  new URL("login.html", BASE).href,
  new URL("manifest.webmanifest", BASE).href,
  new URL("icons/icon-180.png", BASE).href,
  new URL("icons/icon-192.png", BASE).href,
  new URL("icons/icon-512.png", BASE).href,
  new URL("assets/auth.js", BASE).href,
  new URL("assets/sale-core.js", BASE).href,
  new URL("assets/cash-core.js", BASE).href,
  new URL("assets/parser.js", BASE).href,
  new URL("assets/app.js", BASE).href,
  new URL("assets/pos-erp.js", BASE).href
];

const SUPABASE_SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
const API_ORIGIN = "https://myllpwjzaswhdyhsxhmt.supabase.co";

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    // Satu file gagal tidak boleh menggagalkan pemasangan aplikasi.
    await Promise.allSettled(CORE.map(function (url) { return cache.add(url); }));
    await Promise.allSettled([cache.add(SUPABASE_SDK)]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(function (key) { return key.indexOf("catatin-pos-") === 0 && key !== CACHE; })
      .map(function (key) { return caches.delete(key); }));
    await self.clients.claim();
  })());
});

async function putInCache(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

async function networkFirst(request, cacheIt) {
  try {
    const response = await fetch(request);
    if (cacheIt) await putInCache(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function navigate(request) {
  try {
    const response = await fetch(request);
    // Simpan halaman kasir tanpa parameter ?next= agar bisa dipakai offline.
    if (response && response.ok) {
      const clean = new URL(request.url);
      clean.search = "";
      await putInCache(clean.href, response);
      await putInCache(request, response);
    }
    return response;
  } catch (error) {
    const exact = await caches.match(request);
    if (exact) return exact;

    const clean = new URL(request.url);
    clean.search = "";
    const samePage = await caches.match(clean.href);
    if (samePage) return samePage;

    const shell = await caches.match(new URL("index.html", BASE).href);
    if (shell) return shell;

    const login = await caches.match(new URL("login.html", BASE).href);
    if (login) return login;

    return new Response(
      "<!doctype html><html lang=\"id\"><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>Kasir offline</title><body style=\"font:16px system-ui;padding:24px;background:#f5f7fb;color:#1b2433\">" +
      "<h1>Kasir belum bisa dibuka offline</h1>" +
      "<p>Halaman ini belum tersimpan di perangkat. Sambungkan internet, buka kasir sekali, lalu coba lagi.</p>" +
      "</body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === API_ORIGIN) return; // data ERP selalu langsung ke server
  if (url.origin === self.location.origin && url.pathname === new URL("sw.js", BASE).pathname) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && (url.pathname.indexOf(BASE.pathname) === 0 || url.pathname.indexOf(ASSETS.pathname) === 0)) {
    event.respondWith(networkFirst(request, true));
    return;
  }

  if (url.href === SUPABASE_SDK) {
    event.respondWith(networkFirst(request, true));
  }
});
