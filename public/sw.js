/* 풍계모 여행앱 서비스워커 — 웹 푸시 수신 + 클릭 처리 + 오프라인 폴백 */

const CACHE = "poongsan-v1";
const PRECACHE = ["/offline.html", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 과거 버전 캐시 정리
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET 외(POST 등)·타 출처는 그대로 통과 — Supabase/실시간/거래 무결성 보호
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 페이지 이동: network-first → 실패 시 오프라인 폴백
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // 정적 에셋(_next/static, 아이콘 등): stale-while-revalidate
  if (url.pathname.startsWith("/_next/static") || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "알림", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "🏝️ 풍계모 여행";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon.svg",
    badge: "/icon.svg",
    data: { url: data.url || "/dashboard" },
    vibrate: [120, 60, 120],
    tag: data.tag, // 같은 tag면 알림이 갱신됨 (선택)
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // 이미 열린 탭이 있으면 포커스, 없으면 새로 연다.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
