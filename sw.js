/* KAKOI のオフライン用の仕組み（Service Worker）
   アイコンやこのファイルを差し替えたときは、VERSION の数字を上げてください。
   index.html だけを差し替えた場合は、ネットにつながっていれば自動で新しい版になります。 */
const VERSION = 'kakoi-pwa-1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];
// 特殊な PSD（16bit・CMYK など）を開くときだけ使う外部ライブラリ。最初に取っておけばオフラインでも使える
const EXTRA = ['https://cdn.jsdelivr.net/npm/ag-psd@31.0.2/dist/bundle.js'];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    for (const url of EXTRA){
      try {
        const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 10000);
        const res = await fetch(url, { mode: 'cors', signal: ctl.signal }); clearTimeout(timer);
        if (res.ok) await cache.put(url, res);
      } catch (e) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate'){ event.respondWith(pageFirstFromNetwork(req)); return; }
  if (url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname)) event.respondWith(fromCacheFirst(req));
});

// アプリ本体：ネットにつながっていれば最新版、つながらなければ保存してある版
async function pageFirstFromNetwork(req){
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (res && res.ok) await cache.put('./index.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

// アイコン・フォント・ライブラリ：保存してあればそれを使い、なければ取りに行って保存
async function fromCacheFirst(req){
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) await cache.put(req, res.clone());
    return res;
  } catch (e) {
    return Response.error();
  }
}
