// QuestTime Custom Service Worker Extensions
// Handles notification interactions, background periodic sync, and push events.

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  // If a window is already open, focus it; otherwise open a new window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Periodic Background Sync (Supported in Chrome on Android for installed PWAs)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-streak-reminder') {
    event.waitUntil(
      self.registration.showNotification('🔥 QuestTime Streak Alert', {
        body: 'Keep your daily momentum alive! Take a moment to log your focus session today.',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'daily-streak-reminder',
        renotify: true,
        data: { url: '/' },
      })
    );
  }
});

// Web Push event listener
self.addEventListener('push', (event) => {
  let title = 'QuestTime';
  let body = 'Time to focus and protect your streak!';
  let tag = 'questtime-alert';

  if (event.data) {
    try {
      const payload = event.data.json();
      title = payload.title || title;
      body = payload.body || body;
      tag = payload.tag || tag;
    } catch {
      body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag,
      renotify: true,
      data: { url: '/' },
    })
  );
});
