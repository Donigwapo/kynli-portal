import { beforeAll, describe, expect, it } from "vitest";

let isDesignatedPrimaryBusinessOwnerForTenant: any;

describe("isDesignatedPrimaryBusinessOwnerForTenant", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    const supabaseModule = await import("./supabase");
    isDesignatedPrimaryBusinessOwnerForTenant = supabaseModule.isDesignatedPrimaryBusinessOwnerForTenant;
  });
  it("matches tenant.email to member email case-insensitively", () => {
    const out = isDesignatedPrimaryBusinessOwnerForTenant({
      tenant: { email: "Owner@Acme.com", contact_name: "Owner Name" },
      memberEmail: "owner@acme.com",
    });

    expect(out).toBe(true);
  });

  it("falls back to contact_name when contact_name is an email-like value", () => {
    const out = isDesignatedPrimaryBusinessOwnerForTenant({
      tenant: { email: null, contact_name: "owner_fallback@acme.com" },
      memberEmail: "owner_fallback@acme.com",
    });

    expect(out).toBe(true);
  });

  it("does not treat plain contact names as designated owner emails", () => {
    const out = isDesignatedPrimaryBusinessOwnerForTenant({
      tenant: { email: null, contact_name: "Jane Owner" },
      memberEmail: "jane.owner@acme.com",
    });

    expect(out).toBe(false);
  });

  it("does not protect non-designated members", () => {
    const out = isDesignatedPrimaryBusinessOwnerForTenant({
      tenant: { email: "owner@acme.com", contact_name: "Owner Name" },
      memberEmail: "member@acme.com",
    });

    expect(out).toBe(false);
  });
});
