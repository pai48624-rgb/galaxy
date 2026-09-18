// galaxy-sw.js — AI 성단지도 PWA 설치 요건 충족용 최소 서비스워커.
// 정적 사이트라 복잡한 캐싱 전략은 필요 없고, 오프라인일 때 최소한 앱 껍데기(/)라도
// 뜨게 하는 것과, 브라우저가 "설치 가능"으로 판단하게 하는 것이 목적.
const CACHE_NAME = "ai-galaxy-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || caches.match("/"))
    )
  );
});
