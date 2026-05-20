/* Firebase Messaging Service Worker (Web Push) */
/* eslint-disable no-undef */

importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

let initialized = false;

function maybeInitFirebase(config) {
  if (initialized) return;
  if (!config) return;
  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) return;

  firebase.initializeApp(config);
  firebase.messaging();
  initialized = true;
}

self.addEventListener("message", (event) => {
  const data = event?.data;
  if (!data || data.type !== "FIREBASE_CONFIG") return;
  maybeInitFirebase(data.config || null);
});
