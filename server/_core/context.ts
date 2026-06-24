import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { CLIENT_WORKSPACE_COOKIE, getPortalUserFromRequest, VIEW_AS_CLIENT_COOKIE } from "../auth";
import type { PortalUser } from "../supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: PortalUser | null;
  viewAsClientTenantSlug: string | null;
  clientWorkspaceTenantSlug: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: PortalUser | null = null;

  try {
    user = await getPortalUserFromRequest(opts.req);
  } catch {
    user = null;
  }

  const rawViewAs = (opts.req.cookies?.[VIEW_AS_CLIENT_COOKIE] as string | undefined) ?? "";
  const viewAsClientTenantSlug = rawViewAs.trim() || null;

  const rawClientWorkspace = (opts.req.cookies?.[CLIENT_WORKSPACE_COOKIE] as string | undefined) ?? "";
  const clientWorkspaceTenantSlug = rawClientWorkspace.trim() || null;

  return {
    req: opts.req,
    res: opts.res,
    user,
    viewAsClientTenantSlug,
    clientWorkspaceTenantSlug,
  };
}
