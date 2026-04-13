import { describe, it, expect } from "vitest";

describe("Supabase credentials", () => {
  it("SUPABASE_URL is set and valid", () => {
    const url = process.env.SUPABASE_URL;
    expect(url).toBeTruthy();
    expect(url).toContain("supabase.co");
  });

  it("SUPABASE_SERVICE_ROLE_KEY is set", () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(key).toBeTruthy();
    expect(key!.length).toBeGreaterThan(20);
  });

  it("can connect to Supabase REST API and read portal_tenants", async () => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const res = await fetch(`${url}/rest/v1/portal_tenants?limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].slug).toBe("grit_media_group_llc");
  });
});
