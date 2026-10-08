import { trpc } from "@/lib/trpc";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Moon, Settings, Sun, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground break-words">{value || "—"}</p>
    </div>
  );
}

export default function AdminProfile() {
  const { data: authUser, isLoading, error } = trpc.auth.me.useQuery();
  const changePassword = trpc.auth.changePassword.useMutation();
  const { theme, setTheme } = useTheme();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 8;
  const passwordsMatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitPassword =
    !isUpdatingPassword &&
    newPassword.length >= 8 &&
    confirmPassword.length >= 8 &&
    passwordsMatch;

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Please enter and confirm your new password.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await changePassword.mutateAsync({ newPassword });

      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      toast.success("Password updated successfully.");
    } catch (err: any) {
      toast.error(err?.message || "Unable to update password. Please try again.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={16} />
          <span>Loading admin settings…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-500/40 dark:border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <div>
            <p className="font-medium">Unable to load admin settings</p>
            <p className="text-red-700/90 dark:text-red-200/90 mt-1">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Admin Settings</h1>
            <p className="text-sm text-muted-foreground">Your account profile</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" value={authUser?.name ?? ""} />
        <Field label="Email" value={authUser?.email ?? ""} />
        <Field label="Role" value={authUser?.role ?? ""} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <User size={16} />
        Signed in as <span className="text-foreground font-medium">{authUser?.email ?? "Unknown user"}</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
          <p className="text-xs text-muted-foreground">Customize how the portal looks and feels.</p>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium text-foreground">Theme</p>
            <p className="text-xs text-muted-foreground">Choose your preferred color theme for the portal.</p>
          </div>

          <ToggleGroup
            type="single"
            value={theme}
            onValueChange={(value) => {
              if (value === "light" || value === "dark") setTheme(value);
            }}
            variant="outline"
            className="border border-border rounded-lg bg-background p-0.5"
            aria-label="Theme selection"
          >
            <ToggleGroupItem value="light" className="gap-1.5 px-3 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
              <Sun size={14} />
              <span>Light</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" className="gap-1.5 px-3 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
              <Moon size={14} />
              <span>Dark</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm text-foreground font-medium">
          <Lock size={16} />
          Security
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground"
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto text-muted-foreground hover:text-foreground"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordTooShort && <p className="text-xs text-amber-700 dark:text-amber-300">Password must be at least 8 characters.</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground"
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto text-muted-foreground hover:text-foreground"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-700 dark:text-red-300">Passwords do not match.</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setNewPassword("");
              setConfirmPassword("");
              setShowNewPassword(false);
              setShowConfirmPassword(false);
            }}
            disabled={isUpdatingPassword}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpdatePassword}
            disabled={!canSubmitPassword}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {isUpdatingPassword ? <Loader2 size={14} className="animate-spin" /> : null}
            Update Password
          </button>
        </div>
      </div>
    </div>
  );
}
