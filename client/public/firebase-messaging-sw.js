/* Firebase Messaging Service Worker (Web Push) */
/* eslint-disable no-undef */

importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

let initialized = false;
let messaging = null;

function maybeInitFirebase(config) {
  if (initialized) return;
  if (!config) return;
  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) return;

  firebase.initializeApp(config);
  messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notif = payload?.notification || {};
    const data = payload?.data || {};

    const title = notif.title || data.title || "New notification";
    const body = notif.body || data.body || data.content || "";
    const icon = notif.icon || data.icon || "/favicon.ico";

    const options = {
      body,
      icon,
      data: {
        ...data,
        click_action: notif.click_action || data.click_action || data.target_path || "/",
      },
    };

    self.registration.showNotification(title, options);
  });

  initialized = true;
}

self.addEventListener("message", (event) => {
  const data = event?.data;
  if (!data || data.type !== "FIREBASE_CONFIG") return;
  maybeInitFirebase(data.config || null);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event?.notification?.data?.click_action || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
      return undefined;
    }),
  );
});
