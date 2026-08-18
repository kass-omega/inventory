/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// 1. Listen for incoming push events from NestJS
self.addEventListener("push", (event) => {
  let data = {
    title: "New Notification",
    body: "You have a new update.",
    url: "/dashboard",
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options: NotificationOptions = {
    body: data.body,
    data: {
      url: data.url || "/dashboard", // Dynamic destination page
    },
    vibrate: [100, 50, 100],
    // Unique tag so each push shows as its own notification
    tag: `app-notification-${Date.now()}`,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 2. Handle notification click (focus tab or open target page)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If a tab is already open on the app, focus it and navigate
        for (const client of windowClients) {
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // If no tab is open, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
