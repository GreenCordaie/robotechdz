const CACHE_NAME = 'pc-ia-v1';
const ASSETS = [
    '/admin',
    '/manifest.json',
    '/logo.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const payload = event.data.json();
        const options = {
            body: payload.body,
            icon: '/logo.png',
            badge: '/logo.png',
            vibrate: [200, 100, 200],
            data: {
                url: payload.url || '/admin/dashboard'
            }
        };

        event.waitUntil(
            self.registration.showNotification(payload.title, options)
        );
    } catch (e) {
        console.error('Error in push event:', e);
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});
