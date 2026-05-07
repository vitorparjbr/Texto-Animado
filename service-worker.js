const CACHE_NAME = 'textflow-v11';
const APP_SHELL_URL = './index.html';
const ASSETS_TO_CACHE = [
    './',
    APP_SHELL_URL,
    './styles/utils.css',
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

self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') {
        return;
    }

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).then(function(response) {
                if (response && response.ok) {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(APP_SHELL_URL, responseClone);
                    });
                }
                return response;
            }).catch(function() {
                return caches.match(APP_SHELL_URL);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(function(response) {
                // Cache font files and other GET requests dynamically
                if (response.ok) {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(function() {
                return caches.match(event.request);
            });
        })
    );
});
