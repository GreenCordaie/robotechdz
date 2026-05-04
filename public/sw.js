const CACHE_NAME = 'pc-ia-v4';
const PRECACHE_ASSETS = [
    '/admin/login',
    '/manifest.webmanifest',
    '/logo.png'
];

// External origins to never intercept
const EXTERNAL_ORIGINS = [
    'cloudflareinsights.com',
    'cloudflare.com',
    'challenges.cloudflare.com',
    'googleapis.com',
    'gstatic.com',
    'fonts.googleapis.com',
];

function isExternal(url) {
    return EXTERNAL_ORIGINS.some(origin => url.includes(origin));
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
    );
    // Activate immediately without waiting for old SW to finish
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Remove old caches
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Never intercept external resources — let browser handle them
    if (isExternal(url)) return;

    // Never intercept POST (Server Actions) — critical for Next.js
    if (event.request.method !== 'GET') return;

    // Never intercept API routes — always fresh
    if (url.includes('/api/')) return;

    // Never intercept Next.js bundle/HMR assets — browser HTTP cache + immutable hashes
    // handle these correctly. SW caching here serves stale chunks after rebuilds and
    // breaks webpack runtime ("Cannot read properties of undefined (reading 'call')").
    if (url.includes('/_next/')) return;

    // Navigation requests (page loads) — network first, no cache fallback to avoid stale pages
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() =>
                // Only fall back to login page on total offline
                caches.match('/admin/login')
            )
        );
        return;
    }

    // Static assets — cache first
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Only cache successful same-origin responses
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});

// ─── Badge counter (persisted across notifications) ──────────────────────────
let badgeCount = 0;

async function updateBadge(delta) {
    badgeCount = Math.max(0, badgeCount + delta);
    if (navigator.setAppBadge) {
        if (badgeCount > 0) {
            await navigator.setAppBadge(badgeCount);
        } else {
            await navigator.clearAppBadge();
        }
    }
}

self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const data = event.data.json();
        event.waitUntil(
            Promise.all([
                self.registration.showNotification(data.title || 'Notification', {
                    body: data.body || '',
                    icon: data.icon || '/icon-192.png',
                    badge: '/badge-96.png',
                    tag: data.tag || 'default',
                    renotify: true,
                    data: { url: data.url || '/admin/dashboard' },
                    vibrate: [200, 100, 200],
                    actions: data.actions || [],
                }),
                updateBadge(1),
            ])
        );
    } catch (err) {
        // Ignore malformed push payloads
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = event.notification.data?.url || '/admin/dashboard';
    event.waitUntil(
        Promise.all([
            updateBadge(-1),
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.navigate(target);
                        return client.focus();
                    }
                }
                if (clients.openWindow) return clients.openWindow(target);
            }),
        ])
    );
});

// Clear badge when user opens the app
self.addEventListener('message', (event) => {
    if (event.data === 'CLEAR_BADGE') {
        badgeCount = 0;
        if (navigator.clearAppBadge) navigator.clearAppBadge();
    }
});
