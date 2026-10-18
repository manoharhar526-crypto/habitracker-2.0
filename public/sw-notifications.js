// Service Worker for web push / scheduled notifications
// IMPORTANT: This SW must NEVER cache page assets. Its sole purpose is
// notifications. On every activation we wipe any caches that may have been
// left behind by previous builds so users always get the latest website.

const SW_VERSION = 'v3-2026-05-31';

self.addEventListener('install', (event) => {
  // Activate this SW immediately on update — don't wait for tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Nuke ALL caches — guarantees no stale HTML/JS/CSS is served.
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch (e) { /* ignore */ }
    await self.clients.claim();
  })());
});

// Explicitly do NOT register a 'fetch' listener — without it, the browser
// goes straight to the network for every request and updates show up instantly.

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    const { notifications } = event.data;
    self.__pendingNotifications = notifications || [];
  }
  if (event.data && event.data.type === 'CANCEL_NOTIFICATIONS') {
    self.__pendingNotifications = [];
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

// Check every minute if any scheduled notification is due
setInterval(() => {
  const now = Date.now();
  const pending = self.__pendingNotifications || [];
  const remaining = [];
  for (const n of pending) {
    if (n.at <= now) {
      self.registration.showNotification(n.title, {
        body: n.body,
        icon: '/favicon.ico',
        badge: '/favicon-32.png',
        tag: String(n.id),
      });
    } else {
      remaining.push(n);
    }
  }
  self.__pendingNotifications = remaining;
}, 60000);
