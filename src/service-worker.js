import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

// Required by vite-plugin-pwa with registerType: 'autoUpdate'
// Activates new SW immediately without waiting for tabs to close
self.skipWaiting();
clientsClaim();

// Remove old cached assets from previous versions
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const supabaseUrlPattern = /^https:\/\/.*\.supabase\.co\/.*/i;

registerRoute(
  ({ url, request }) => supabaseUrlPattern.test(url.href) && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'supabase-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24,
      }),
    ],
  })
);

const bgSyncPlugin = new BackgroundSyncPlugin('supabase-write-queue', {
  maxRetentionTime: 24 * 60,
});

registerRoute(
  ({ url, request }) => supabaseUrlPattern.test(url.href) && request.method !== 'GET',
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  })
);

const notifyClientsToSync = async () => {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'PRECHECK_SYNC' });
  }
};

self.addEventListener('sync', (event) => {
  if (event.tag === 'precheck-sync') {
    event.waitUntil(notifyClientsToSync());
  }
});
