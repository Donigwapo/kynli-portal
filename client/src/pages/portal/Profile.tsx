import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  getFcmToken,
  getNotificationPermissionDiagnostics,
  requestNotificationPermission,
} from "@/lib/firebase";
import { PACKAGE_LABELS } from "@shared/tiers";
import { AlertCircle, Bell, Building2, CheckCircle2, Loader2, User } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground break-words">{value}</p>
    </div>
  );
}

export default function Profile() {
  const { impersonatingTenantSlug } = usePortal();
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);

  const utils = trpc.useUtils();
  const registerPushToken = trpc.notifications.registerPushToken.useMutation();

  const {
    data: authUser,
    isLoading: userLoading,
    error: userError,
  } = trpc.auth.me.useQuery();

  const {
    data: tenant,
    isLoading: tenantLoading,
    error: tenantError,
  } = trpc.tenant.me.useQuery(undefined, { enabled: !impersonatingTenantSlug });

  const isLoading = userLoading || (!impersonatingTenantSlug && tenantLoading);
  const error = userError ?? tenantError;

  const permissionDiagnostics = useMemo(() => getNotificationPermissionDiagnostics(), [authUser?.id]);
  const permissionState = permissionDiagnostics.permission;

  const handleEnableNotifications = async () => {
    if (!authUser?.id) {
      toast.error("You must be signed in to enable notifications.");
      return;
    }

    if (!permissionDiagnostics.supported) {
      toast.error("This browser does not support push notifications.");
      return;
    }

    if (!permissionDiagnostics.secureContext) {
      toast.error("Notifications require HTTPS (localhost is allowed for development).");
      return;
    }

    if (permissionState === "denied") {
      toast.error("Notifications are blocked. Re-enable them in browser Site Settings for this site.");
      return;
    }

    setIsEnablingNotifications(true);
    try {
      const before = Notification.permission;
      const permission = await requestNotificationPermission();

      if (permission === "denied") {
        if (before === "default") {
          toast.error("Notification permission was denied. In Chrome: click the lock icon in the address bar → Site settings → Notifications → Allow, then refresh.");
        } else {
          toast.error("Notifications are blocked. Update browser Site Settings to Allow notifications for this site.");
        }
        return;
      }

      if (permission !== "granted") {
        toast.message("Notification permission not granted.");
        return;
      }

      const token = await getFcmToken();
      if (!token) {
        toast.error("Unable to retrieve notification token. Confirm Firebase env + VAPID key and service worker setup.");
        return;
      }

      await registerPushToken.mutateAsync({
        fcmToken: token,
        deviceType: "web",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      });

      await utils.notifications.invalidate();
      toast.success("Notifications enabled for this browser.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to enable notifications.");
    } finally {
      setIsEnablingNotifications(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={16} />
          <span>Loading your profile…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <div>
            <p className="font-medium">Unable to load profile</p>
            <p className="text-red-200/90 mt-1">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No tenant profile found for this account.
        </div>
      </div>
    );
  }

  const packageLabel = PACKAGE_LABELS[tenant.package_tier] ?? tenant.package_tier;
  const status = tenant.is_churned ? "Churned" : tenant.is_active ? "Active" : "Inactive";
  const inviteAccepted = tenant.invite_accepted ? "Accepted" : "Pending";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Client Profile</h1>
            <p className="text-sm text-muted-foreground">Your account and company details</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 size={14} className={tenant.invite_accepted ? "text-emerald-400" : "text-amber-400"} />
          Invite status: <span className="text-foreground font-medium">{inviteAccepted}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Company Name" value={tenant.company_name || "—"} />
        <Field label="Contact Name" value={tenant.contact_name || authUser?.name || "—"} />
        <Field label="Email" value={tenant.email || authUser?.email || "—"} />
        <Field label="Package / Tier" value={packageLabel} />
        <Field label="Status" value={status} />
        <Field label="Client Slug" value={tenant.slug} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <User size={16} />
        Signed in as <span className="text-foreground font-medium">{authUser?.email ?? "Unknown user"}</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground font-medium">
          <Bell size={16} />
          Browser Notifications
        </div>
        <p className="text-xs text-muted-foreground">
          Permission: <span className="text-foreground font-medium">{permissionState}</span>
        </p>
        {!permissionDiagnostics.secureContext && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Notifications require HTTPS in production. For local development, use <span className="font-semibold">localhost</span>.
          </div>
        )}
        {permissionState === "denied" && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            Notifications are currently blocked by your browser. In Chrome: click the lock icon → Site settings → Notifications → Allow, then refresh.
          </div>
        )}
        <button
          type="button"
          onClick={handleEnableNotifications}
          disabled={isEnablingNotifications || permissionState === "denied" || !permissionDiagnostics.supported || !permissionDiagnostics.secureContext}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isEnablingNotifications ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          Enable notifications
        </button>
      </div>
    </div>
  );
}
