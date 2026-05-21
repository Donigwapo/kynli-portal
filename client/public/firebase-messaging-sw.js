/* Firebase Messaging Service Worker (Web Push) */
/* eslint-disable no-undef */

console.log("[FCM SW INIT] Service worker script loaded", {
  scope: self.registration?.scope,
  location: self.location?.href,
});

importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

let initialized = false;
let messaging = null;

function maybeInitFirebase(config) {
  if (initialized) {
    console.log("[FCM SW INIT] Firebase already initialized", { config });
    return;
  }
  if (!config) {
    console.warn("[FCM SW INIT] Missing firebase config payload", { config });
    return;
  }
  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
    console.warn("[FCM SW INIT] Incomplete firebase config", { config });
    return;
  }

  try {
    firebase.initializeApp(config);
    messaging = firebase.messaging();
    console.log("[FCM SW INIT] Firebase initialized", { config });

    messaging.onBackgroundMessage((payload) => {
      console.log("[FCM Background Received]", payload);

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

      console.log("[FCM showNotification]", { title, options, payload });
      self.registration.showNotification(title, options);
    });

    initialized = true;
  } catch (error) {
    console.error("[FCM SW INIT] Firebase initialization failed", { error, config });
  }
}

self.addEventListener("message", (event) => {
  console.log("[FCM SW INIT] message event", event?.data);
  const data = event?.data;
  if (!data || data.type !== "FIREBASE_CONFIG") return;
  maybeInitFirebase(data.config || null);
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let parsed = null;
    let rawText = null;
    try {
      parsed = event?.data?.json?.() ?? null;
    } catch {
      try {
        rawText = await event?.data?.text?.();
      } catch {
        rawText = null;
      }
    }

    console.log("[FCM Push Event]", {
      hasData: Boolean(event?.data),
      parsed,
      rawText,
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  const target = event?.notification?.data?.click_action || "/";
  console.log("[FCM Notification Click]", {
    target,
    notification: {
      title: event?.notification?.title,
      body: event?.notification?.body,
      data: event?.notification?.data,
    },
  });
  event.notification.close();
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
