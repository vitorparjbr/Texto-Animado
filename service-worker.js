const CACHE_NAME = 'textflow-v2';
const ASSETS_TO_CACHE = [
    './',
    './Texto Animado.html',
    './styles/main.css',
    './scripts/state.js',
    './scripts/render.js',
    './scripts/exporter.js',
    './scripts/events.js',
    './scripts/main.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './manifest.json'
];

const EXTERNAL_CACHE = [
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Playfair+Display:wght@400;700;900&family=Roboto+Mono:wght@400;700&family=Bebas+Neue&family=Pacifico&family=Oswald:wght@400;700&display=swap'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(ASSETS_TO_CACHE).then(function() {
                // Cache external resources separately (best-effort)
                return Promise.allSettled(
                    EXTERNAL_CACHE.map(function(url) {
                        return fetch(url, { mode: 'cors' }).then(function(response) {
                            if (response.ok) {
                                return cache.put(url, response);
                            }
                        });
                    })
                );
            });
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function(name) { return name !== CACHE_NAME; })
                    .map(function(name) { return caches.delete(name); })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(function(response) {
                // Cache font files and other GET requests dynamically
                if (response.ok && event.request.method === 'GET') {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(function() {
                // Offline fallback - return cached index for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('./Texto Animado.html');
                }
            });
        })
    );
});
