/* Pinit — conservative shell cache only. Live data always from network. */
const CACHE_NAME = 'pinit-shell-v1';

const SHELL_PATHS = new Set([
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json',
  '/og-image.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]);

function isShellPath(pathname) {
  if (SHELL_PATHS.has(pathname)) return true;
  return false;
}

function shouldNeverCache(url, request) {
  if (request.method !== 'GET') return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname === '/admin' || url.pathname === '/admin.html') return true;
  if (url.pathname.endsWith('service-worker.js')) return true;
  if (url.hostname.includes('supabase')) return true;
  return false;
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        '/favicon.svg',
        '/manifest.json',
        '/og-image.svg',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon-maskable-512.png',
      ]).catch(function() {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (shouldNeverCache(url, request)) return;
  if (!isShellPath(url.pathname)) return;

  event.respondWith(
    fetch(request).then(function(response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, copy);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(request);
    })
  );
});
