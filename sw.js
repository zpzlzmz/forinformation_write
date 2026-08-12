/**
 * 오프라인 캐시. 껍데기만 미리 받아 두고 문제 데이터·그림·KaTeX는 처음 열 때 캐시한다.
 * 응답은 캐시를 먼저 내주고 뒤에서 새로 받아 갱신한다(stale-while-revalidate).
 * 그래서 문제를 추가해도 다음에 열 때 반영된다.
 */
const CACHE = "expl-quiz-v4";

const SHELL = [
  "./",
  "./index.html",
  "./app.js?v=3",
  "./styles.css?v=3",
  "./manifest.json",
  "./data/catalog.js?v=3",
  "./img/icon/icon-192.png",
  "./img/icon/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 하나가 실패해도 설치 자체는 막지 않는다
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** 문제 데이터는 새로 추가되면 바로 보여야 하므로 네트워크를 먼저 본다. */
function isData(url) {
  return url.pathname.includes("/data/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin === self.location.origin && isData(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || new Response("", { status: 504 })))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      // 같은 출처 파일은 브라우저 HTTP 캐시를 건너뛰고 서버에 직접 재검증한다.
      // 이걸 안 하면 앱을 고쳐도 옛 파일이 계속 캐시에 다시 저장된다.
      const opts = url.origin === self.location.origin ? { cache: "no-cache" } : undefined;
      const fresh = fetch(req, opts)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      const res = await fresh;
      if (res) return res;
      return new Response("오프라인이라 아직 받지 못한 자료입니다.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })
  );
});
