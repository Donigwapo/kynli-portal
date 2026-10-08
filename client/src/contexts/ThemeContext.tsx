import { trpc } from "@/lib/trpc";
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

const isTheme = (value: string | null): value is Theme => value === "light" || value === "dark";
const storageKeyForUser = (userId: string | number) => `kynli:theme:${String(userId)}`;

// Prevent accidental light flash before auth/theme resolution.
if (typeof document !== "undefined") {
  document.documentElement.classList.add("dark");
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  const authQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const resolvedUserId = authQuery.data?.id ?? null;
  const authResolved = !authQuery.isLoading;
  const lastResolvedUserIdRef = useRef<string | null>(null);
  const applyingStoredThemeRef = useRef(false);
  const targetThemeRef = useRef<Theme>(defaultTheme);

  const setTheme = useCallback((nextTheme: Theme) => {
    targetThemeRef.current = nextTheme;
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    if (!switchable) {
      targetThemeRef.current = defaultTheme;
      setThemeState(defaultTheme);
      return;
    }

    if (!authResolved) return;

    if (resolvedUserId == null) {
      lastResolvedUserIdRef.current = null;
      targetThemeRef.current = defaultTheme;
      setThemeState(defaultTheme);
      return;
    }

    const userId = String(resolvedUserId);

    if (lastResolvedUserIdRef.current === userId) {
      return;
    }

    lastResolvedUserIdRef.current = userId;

    const stored = localStorage.getItem(storageKeyForUser(userId));
    const nextTheme = isTheme(stored) ? stored : defaultTheme;

    applyingStoredThemeRef.current = true;
    targetThemeRef.current = nextTheme;
    setThemeState(nextTheme);
  }, [authResolved, resolvedUserId, defaultTheme, switchable]);

  useEffect(() => {
    if (!switchable) return;
    if (!authResolved) return;
    if (resolvedUserId == null) return;

    // Skip one write when hydrating from storage on account switch/login.
    if (applyingStoredThemeRef.current) {
      applyingStoredThemeRef.current = false;
      return;
    }

    // Ignore stale writes while waiting for state to settle to the latest intent.
    if (theme !== targetThemeRef.current) return;

    localStorage.setItem(storageKeyForUser(resolvedUserId), theme);
  }, [theme, authResolved, resolvedUserId, switchable]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = switchable
    ? () => {
        setThemeState((prev) => {
          const next = prev === "light" ? "dark" : "light";
          targetThemeRef.current = next;
          return next;
        });
      }
    : undefined;

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, switchable }),
    [theme, setTheme, toggleTheme, switchable]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
