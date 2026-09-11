/* sw.js — 로또 스틸의 법칙 서비스 워커
 * ===================================
 * 목적: "홈 화면에 추가"(PWA) 설치 요건 충족 + 오프라인/느린 네트워크에서도
 *       앱 껍데기(shell)가 뜨게 하는 것. 당첨번호 같은 실데이터는 온라인일 때만
 *       정확하므로 캐시를 "신선도 우선"으로 다룬다.
 *
 * 캐싱 전략
 *   - 페이지 이동(navigate)      : 네트워크 우선 → 실패 시 캐시 → 그것도 없으면 /offline
 *   - /static/* (JS·CSS·아이콘)  : 캐시 우선 + 백그라운드 갱신(stale-while-revalidate)
 *   - /api/* (GET)               : 네트워크 우선 → 실패 시 마지막 캐시 → 없으면 503 JSON
 *   - 그 외/비GET/크로스오리진    : 그냥 통과(fetch)
 *
 * 버전을 올리면(아래 CACHE_VERSION) 예전 캐시는 activate 시 전부 삭제된다.
 * static 자산은 템플릿에서 ?v=<파일수정시각> 쿼리로 캐시버스팅되므로, 파일이 바뀌면
 * URL이 달라져 자동으로 새로 받는다.
 */
const CACHE_VERSION = "v1-2026-09-10";
const CACHE_NAME = `lotto-steal-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

// 설치 시 미리 받아둘 최소한의 페이지 껍데기.
const PRECACHE_URLS = [
  "/",
  "/generate",
  "/check",
  "/stats",
  "/my",
  "/privacy",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 개별 실패가 전체 설치를 막지 않도록 하나씩 최대한 담는다.
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// 페이지에서 새 버전 즉시 적용을 요청할 수 있게 한다.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/static/");
}

function isApiGet(request, url) {
  return request.method === "GET" && url.origin === self.location.origin && url.pathname.startsWith("/api/");
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function networkFirst(request, { fallbackOffline = false } = {}) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackOffline) {
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response(
      JSON.stringify({ error: "오프라인 상태예요. 네트워크에 연결되면 다시 시도해주세요." }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return; // POST/DELETE 등은 절대 캐시하지 않음

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, { fallbackOffline: true }));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (isApiGet(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  // 그 외(크로스오리진 등)는 그대로 통과.
});
