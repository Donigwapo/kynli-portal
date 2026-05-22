import { initializeApp, type FirebaseApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type MessagePayload, type Messaging } from "firebase/messaging";

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
  if (workerRegistrationRef) {
    console.log("[FCM SW REGISTER] Reusing existing service worker registration", workerRegistrationRef);
    return workerRegistrationRef;
  }

  console.log("[FCM SW REGISTER] Registering firebase messaging service worker", {
    scriptURL: "/firebase-messaging-sw.js",
    scope: "/",
  });
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
  console.log("[FCM SW REGISTER] Registration result", {
    scriptURL: reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL,
    scope: reg.scope,
    activeState: reg.active?.state,
  });

  if (reg.active) {
    console.log("[FCM SW REGISTER] Posting firebase config to active worker", firebaseConfig);
    reg.active.postMessage({ type: "FIREBASE_CONFIG", config: firebaseConfig });
  } else if (reg.installing) {
    console.log("[FCM SW REGISTER] Worker installing; will post config on activation");
    reg.installing.addEventListener("statechange", () => {
      if (reg.active) {
        console.log("[FCM SW REGISTER] Worker active after install; posting config", firebaseConfig);
        reg.active.postMessage({ type: "FIREBASE_CONFIG", config: firebaseConfig });
      }
    });
  }

  workerRegistrationRef = reg;
  return reg;
}

export async function getFcmToken(): Promise<string | null> {
  try {
    if (typeof window === "undefined") {
      console.warn("[FCM Token Generated] window is undefined");
      return null;
    }
    if (!("Notification" in window)) {
      console.warn("[FCM Token Generated] Notification API not available");
      return null;
    }
    if (!("serviceWorker" in navigator)) {
      console.warn("[FCM Token Generated] Service Worker API not available");
      return null;
    }
    if (!hasConfig || !vapidKey) {
      console.warn("[FCM Token Generated] Missing Firebase config or VAPID key", {
        hasConfig,
        hasVapidKey: Boolean(vapidKey),
      });
      return null;
    }
    if (!(await isSupported())) {
      console.warn("[FCM Token Generated] firebase/messaging reports unsupported environment");
      return null;
    }

    const app = getAppInstance();
    if (!messagingRef) messagingRef = getMessaging(app);

    const registration = await registerMessagingWorker();
    console.log("[FCM SW REGISTER] Using registration for token", {
      scriptURL: registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL,
      scope: registration.scope,
    });

    // Ensure the token is bound to the current explicit root-scope SW registration.
    // If an old token exists from a different registration scope, clear and re-issue.
    try {
      const deleted = await deleteToken(messagingRef);
      console.log("[FCM Token Generated] Existing token deleted before refresh", { deleted });
    } catch (err) {
      console.warn("[FCM Token Generated] Failed deleting existing token before refresh", { err });
    }

    const token = await getToken(messagingRef, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log("[FCM Token Generated]", {
        token,
        scriptURL: registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL,
        scope: registration.scope,
      });
    } else {
      console.warn("[FCM Token Generated] getToken returned empty token", {
        scriptURL: registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL,
        scope: registration.scope,
      });
    }

    return token || null;
  } catch (error) {
    console.error("[FCM Token Generated] Failed", { error });
    return null;
  }
}

export async function ensureFcmForegroundHandler(onPayload: (payload: MessagePayload) => void): Promise<void> {
  if (typeof window === "undefined") {
    console.warn("[FCM Foreground Handler Registered] window is undefined");
    return;
  }
  if (!("Notification" in window)) {
    console.warn("[FCM Foreground Handler Registered] Notification API not available");
    return;
  }
  if (!("serviceWorker" in navigator)) {
    console.warn("[FCM Foreground Handler Registered] Service Worker API not available");
    return;
  }
  if (!hasConfig) {
    console.warn("[FCM Foreground Handler Registered] Missing Firebase config", firebaseConfig);
    return;
  }
  if (!(await isSupported())) {
    console.warn("[FCM Foreground Handler Registered] Unsupported firebase messaging environment");
    return;
  }

  const app = getAppInstance();
  if (!messagingRef) messagingRef = getMessaging(app);
  await registerMessagingWorker();

  if (foregroundListenerBound) {
    console.log("[FCM Foreground Handler Registered] already registered");
    return;
  }

  onMessage(messagingRef, (payload) => {
    console.log("[FCM Foreground Received]", payload);
    onPayload(payload);
  });
  foregroundListenerBound = true;
  console.log("[FCM Foreground Handler Registered]", {
    permission: typeof Notification !== "undefined" ? Notification.permission : "unknown",
    firebaseConfig,
  });
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
