import { ensureFcmForegroundHandler } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import { toast } from "sonner";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = "/login";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

void ensureFcmForegroundHandler((payload) => {
  const title = payload.notification?.title || payload.data?.title || "New notification";
  const body = payload.notification?.body || payload.data?.body || payload.data?.content || "";
  const target = payload.data?.click_action || payload.data?.target_path || "/";

  if (typeof window !== "undefined" && document.visibilityState === "visible") {
    toast.message(title, {
      description: body,
      action: {
        label: "Open",
        onClick: () => {
          window.location.href = target;
        },
      },
    });
    return;
  }

  if (typeof window !== "undefined" && Notification.permission === "granted") {
    const n = new Notification(title, { body });
    n.onclick = () => {
      window.focus();
      window.location.href = target;
    };
  }
}).catch((err) => {
  console.warn("[FCM] foreground listener setup skipped", err);
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
