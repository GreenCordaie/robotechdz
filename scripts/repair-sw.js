// Paste this into your browser console (F12 > Console) to fix the Service Worker issues
(async () => {
    console.log('--- Reséquençage du Service Worker ---');

    // 1. Unregister all service workers
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
        await registration.unregister();
        console.log('SW Unregistered:', registration.scope);
    }

    // 2. Clear all caches
    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log('Cache Deleted:', cacheName);
    }

    console.log('--- Opération terminée. Actualisez la page (Ctrl+F5). ---');
    alert('Service Worker et Cache nettoyés. Veuillez actualiser la page.');
})();
