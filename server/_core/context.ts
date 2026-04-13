import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getPortalUserFromRequest } from "../auth";
import type { PortalUser } from "../supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: PortalUser | null;
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

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
