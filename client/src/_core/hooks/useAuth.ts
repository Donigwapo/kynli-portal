import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      // Ensure all user-scoped cached data is purged between accounts.
      utils.auth.me.setData(undefined, null);
      queryClient.clear();
      if (typeof window !== "undefined") {
        localStorage.removeItem("kynli-user-info");
      }
    }
  }, [logoutMutation, utils, queryClient]);

  const state = useMemo(() => {
    localStorage.setItem(
      "kynli-user-info",
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  const lastIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!meQuery.data) {
      lastIdentityRef.current = null;
      return;
    }

    const currentIdentity = `${meQuery.data.id}:${meQuery.data.email ?? ""}`;
    const previousIdentity = lastIdentityRef.current;

    if (previousIdentity && previousIdentity !== currentIdentity) {
      // Session identity changed without a full page refresh; clear user-scoped stale cache/state.
      queryClient.clear();
      localStorage.removeItem("kynli-user-info");
      utils.auth.me.setData(undefined, meQuery.data);
    }

    lastIdentityRef.current = currentIdentity;
  }, [meQuery.data, queryClient, utils.auth.me]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
