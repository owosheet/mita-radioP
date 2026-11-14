/* The broadcasting network's service worker.
 *
 *   mita-shell-<build>  the portal, the manifest and the icons: one shell per release (stage.py stamps the build)
 *   mita-runtime-v1     the player pages, station/episode JSON and the static art: network first, read offline
 *   mita-audio-v1       the episodes actually heard (whole mp3 files), kept across releases, at most 24
 *
 * Same-origin GET only. Cross-origin requests and ?embed=1 pages go straight to the network.
 */
const BUILD = "20261114083337";
const SHELL = `mita-shell-${BUILD}`;
const RUNTIME = "mita-runtime-v1";
const AUDIO = "mita-audio-v1";
const MAX_AUDIO = 24;
const SHELL_FILES = ["./", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
const isAudio = url => /\/audio\/[^/]+\.mp3$/.test(url.pathname);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // one missing file must not sink the install
    await Promise.all(SHELL_FILES.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys())
      if (key.startsWith("mita-shell-") && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // another site: let the network answer
  if (url.searchParams.has("embed")) return;         // an embedded player stays live
  event.respondWith(handle(event, req, url));
});

async function handle(event, req, url) {
  // a page that embeds the player does not read or refill the caches
  if (event.clientId) {
    try {
      const client = await self.clients.get(event.clientId);
      if (client && /[?&]embed\b/.test(client.url)) return fetch(req);
    } catch {}
  }
  if (isAudio(url)) return audioResponse(req, url, event);
  if (req.mode === "navigate") return networkFirst(req, RUNTIME, event, "./");   // pages visited before survive a release
  if (url.pathname.endsWith(".json")) return networkFirst(req, RUNTIME, event);
  return staleWhileRevalidate(req, RUNTIME, event);
}

async function networkFirst(req, cacheName, event, fallbackUrl) {
  const cache = await caches.open(cacheName);
  // the fragment is the app's route (#<key>/<lang>) and never reaches the server: one cached page serves every route
  const key = (() => { const u = new URL(req.url); u.hash = ""; return u.href; })();
  try {
    const res = await fetch(req);
    if (res && res.status === 200) event.waitUntil(cache.put(key, res.clone()).catch(() => {}));
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    if (fallbackUrl) {
      const shell = await caches.open(SHELL);
      const home = await shell.match(fallbackUrl);
      if (home) return home;
    }
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req, cacheName, event) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && res.status === 200) return cache.put(req, res.clone()).then(() => res);
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(network); return hit; }   // keep the worker alive for the refresh
  return (await network) || new Response("", { status: 504, statusText: "Offline" });
}

/* the voice: serve a whole cached file, or the byte range the player asked for. Only a full 200 is stored. */
const inflight = new Map();   // url -> the cache.put still running: a play just after the first byte must not fetch again
async function audioResponse(req, url, event) {
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(url.href, { ignoreVary: true });
  if (hit) return rangeResponse(req, hit);
  let res;
  try { res = await fetch(req); } catch { return new Response("", { status: 504, statusText: "Offline" }); }
  if (res.status === 200 && !req.headers.get("range")) {
    // store in the background: the player must not wait for the file to reach the disk
    const put = (async () => { try { await cache.put(url.href, res.clone()); await trim(cache); } catch {} })()
      .finally(() => inflight.delete(url.href));
    inflight.set(url.href, put);
    event.waitUntil(put);
  }
  return res;
}

async function rangeResponse(req, full) {
  const range = req.headers.get("range");
  if (!range) return full;
  const buf = await full.clone().arrayBuffer(), size = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start, end;
  if (m) {
    const [a, b] = [m[1], m[2]];
    if (a === "" && b === "") start = size;   // invalid: an empty range
    else if (a === "") { start = Math.max(0, size - parseInt(b, 10)); end = size - 1; }
    else { start = parseInt(a, 10); end = b === "" ? size - 1 : Math.min(parseInt(b, 10), size - 1); }
  } else start = size;
  if (!(start >= 0 && start < size && start <= end)) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const body = buf.slice(start, end + 1);
  const headers = new Headers(full.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(body.byteLength));
  headers.set("Accept-Ranges", "bytes");
  return new Response(body, { status: 206, statusText: "Partial Content", headers });
}

/* the caches' key order is insertion order: drop the oldest files first */
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_AUDIO; i++) await cache.delete(keys[i]);
}

/* a Range request on a file not cached yet cannot be stored (206); ask for the whole file once the player plays */
self.addEventListener("message", event => {
  const data = event.data;
  if (!data || data.type !== "warm-audio" || typeof data.url !== "string") return;
  event.waitUntil(warmAudio(data.url));
});

async function warmAudio(href) {
  let url;
  try { url = new URL(href, self.location.href); } catch { return; }
  if (url.origin !== self.location.origin || !isAudio(url)) return;
  const cache = await caches.open(AUDIO);
  const running = inflight.get(url.href);   // the player's own request may still be filling the cache
  if (running) await running;
  if (await cache.match(url.href, { ignoreVary: true })) return;
  try {
    const res = await fetch(url.href, { cache: "no-store" });
    if (res.status === 200) { await cache.put(url.href, res.clone()); await trim(cache); }
  } catch {}
}
