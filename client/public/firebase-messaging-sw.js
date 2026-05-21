/* Firebase Messaging Service Worker (Web Push) */
/* eslint-disable no-undef */

console.log("[FCM SW INIT] Service worker script loaded", {
  scope: self.registration?.scope,
  location: self.location?.href,
});

importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyBgFrByrf_mc1Ao5GVZkOBUxoHIeLEeWwE",
  authDomain: "knyli-portal.firebaseapp.com",
  projectId: "knyli-portal",
  storageBucket: "knyli-portal.firebasestorage.app",
  messagingSenderId: "319381250444",
  appId: "1:319381250444:web:ff05de0719978746b236a9",
};

let messaging = null;

try {
  firebase.initializeApp(firebaseConfig);
  messaging = firebase.messaging();

  console.log("[FCM SW INIT] Firebase initialized", { firebaseConfig });

  messaging.onBackgroundMessage((payload) => {
    console.log("[FCM Background Received]", payload);

    const notif = payload?.notification || {};
    const data = payload?.data || {};

    const title = notif.title || data.title || "New notification";
    const body = notif.body || data.body || data.content || "";
    const icon = notif.icon || data.icon || "/favicon.ico";
    const target = data.click_action || data.target_path || "/portal/chat";

    const options = {
      body,
      icon,
      data: {
        ...data,
        click_action: target,
      },
    };

    console.log("[FCM showNotification]", { title, options, payload });
    self.registration.showNotification(title, options);
  });
} catch (error) {
  console.error("[FCM SW INIT] Firebase initialization failed", { error, firebaseConfig });
}

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
  const target = event?.notification?.data?.click_action || "/portal/chat";

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