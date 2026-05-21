import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let appRef: FirebaseApp | null = null;
let messagingRef: Messaging | null = null;
let workerRegistrationRef: ServiceWorkerRegistration | null = null;
let foregroundListenerBound = false;

const hasConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId,
);

function getAppInstance(): FirebaseApp {
  if (!hasConfig) {
    throw new Error("Firebase config is missing. Please set VITE_FIREBASE_* env vars.");
  }
  if (!appRef) appRef = initializeApp(firebaseConfig);
  return appRef;
}

async function registerMessagingWorker(): Promise<ServiceWorkerRegistration> {
  if (workerRegistrationRef) return workerRegistrationRef;

  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  if (reg.active) {
    reg.active.postMessage({ type: "FIREBASE_CONFIG", config: firebaseConfig });
  } else if (reg.installing) {
    reg.installing.addEventListener("statechange", () => {
      if (reg.active) reg.active.postMessage({ type: "FIREBASE_CONFIG", config: firebaseConfig });
    });
  }

  workerRegistrationRef = reg;
  return reg;
}

export async function getFcmToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window)) return null;
  if (!("serviceWorker" in navigator)) return null;
  if (!hasConfig || !vapidKey) return null;
  if (!(await isSupported())) return null;

  const app = getAppInstance();
  if (!messagingRef) messagingRef = getMessaging(app);

  const registration = await registerMessagingWorker();
  const token = await getToken(messagingRef, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  return token || null;
}

export async function ensureFcmForegroundHandler(onPayload: (payload: MessagePayload) => void): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (!("serviceWorker" in navigator)) return;
  if (!hasConfig || !(await isSupported())) return;

  const app = getAppInstance();
  if (!messagingRef) messagingRef = getMessaging(app);
  await registerMessagingWorker();

  if (foregroundListenerBound) return;
  onMessage(messagingRef, onPayload);
  foregroundListenerBound = true;
}

export function getNotificationPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function getNotificationPermissionDiagnostics(): {
  supported: boolean;
  secureContext: boolean;
  isLocalhost: boolean;
  permission: NotificationPermission | "unsupported";
  reason?: string;
} {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return {
      supported: false,
      secureContext: false,
      isLocalhost: false,
      permission: "unsupported",
      reason: "This browser does not support notifications.",
    };
  }

  const host = window.location.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const secureContext = window.isSecureContext || isLocalhost;
  const permission = Notification.permission;

  if (!secureContext) {
    return {
      supported: true,
      secureContext,
      isLocalhost,
      permission,
      reason: "Notifications require HTTPS (or localhost during development).",
    };
  }

  return {
    supported: true,
    secureContext,
    isLocalhost,
    permission,
  };
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  const diagnostics = getNotificationPermissionDiagnostics();
  if (!diagnostics.supported) return "unsupported";
  if (!diagnostics.secureContext) return "denied";

  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }

  return Notification.requestPermission();
}
