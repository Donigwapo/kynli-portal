import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let appRouter: any;
let supabaseModule: any;

function makeUser(partial: { id: number; role: string; email: string; tenant_slug?: string; name?: string }) {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    supabase_uid: `uid-${partial.id}`,
    email: partial.email,
    name: partial.name ?? partial.email,
    role: partial.role,
    tenant_slug: partial.tenant_slug ?? "acme_llc",
    must_reset_password: false,
    created_at: now,
    updated_at: now,
  };
}

function makeCtx(user: any) {
  return {
    user,
    req: { headers: {}, cookies: {} },
    res: {},
    viewAsClientTenantSlug: null,
    clientWorkspaceTenantSlug: null,
  };
}

describe("documents video direct upload", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    supabaseModule = await import("./supabase");
    const routersModule = await import("./routers");
    appRouter = routersModule.appRouter;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("documents.createSignedUpload rejects unsupported extension (non-video)", async () => {
    const user = makeUser({ id: 101, role: "accountant", email: "acct@test.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.documents.createSignedUpload({
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        docType: "Other",
        year: 2026,
        month: 6,
      }),
    ).rejects.toThrow("Signed upload is only available for supported video files.");
  });

  it("documents.createSignedUpload rejects videos over 250MB", async () => {
    const user = makeUser({ id: 102, role: "accountant", email: "acct2@test.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.documents.createSignedUpload({
        fileName: "big.mp4",
        mimeType: "video/mp4",
        fileSize: 250 * 1024 * 1024 + 1,
        docType: "Other",
        year: 2026,
        month: 6,
      }),
    ).rejects.toThrow("Video is too large. Maximum upload size is 250MB.");
  });

  it("documents.createSignedUpload accepts supported video types (mp4/mov/webm)", async () => {
    const user = makeUser({ id: 103, role: "accountant", email: "acct3@test.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { token: "tok_123", signedUrl: "https://upload.example/signed" },
      error: null,
    });
    const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: "https://public.example/file" } });

    vi.spyOn(supabaseModule.supabase.storage, "from").mockImplementation(() => ({
      createSignedUploadUrl,
      getPublicUrl,
    }) as any);

    const inputs = [
      { fileName: "clip.mp4", mimeType: "video/mp4" },
      { fileName: "clip.mov", mimeType: "video/quicktime" },
      { fileName: "clip.webm", mimeType: "video/webm" },
      { fileName: "clip.m4v", mimeType: "video/mp4" },
      { fileName: "clip.mov", mimeType: "application/octet-stream" },
    ];

    for (const input of inputs) {
      const out = await caller.documents.createSignedUpload({
        ...input,
        fileSize: 5 * 1024 * 1024,
        docType: "Other",
        year: 2026,
        month: 6,
      });

      expect(out.bucket).toBeTruthy();
      expect(out.storagePath).toContain(`staff/${user.id}/`);
      expect(out.token).toBe("tok_123");
    }

    expect(createSignedUploadUrl).toHaveBeenCalledTimes(5);
  });

  it("documents.finalizeDirectUpload rejects storagePath prefix mismatch", async () => {
    const user = makeUser({ id: 104, role: "accountant", email: "acct4@test.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.documents.finalizeDirectUpload({
        name: "video",
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        fileSize: 10 * 1024 * 1024,
        docType: "Other",
        year: 2026,
        month: 6,
        storagePath: "acme_llc/other/2026/06/bad.mp4",
        bucket: process.env.SUPABASE_STORAGE_BUCKET || "documents",
      }),
    ).rejects.toThrow("Invalid upload path for current user scope.");
  });

  it("documents.finalizeDirectUpload rejects unsupported video MIME/extension combinations", async () => {
    const user = makeUser({ id: 105, role: "accountant", email: "acct5@test.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.documents.finalizeDirectUpload({
        name: "video",
        fileName: "clip.mp4",
        mimeType: "image/png",
        fileSize: 10 * 1024 * 1024,
        docType: "Other",
        year: 2026,
        month: 6,
        storagePath: `staff/${user.id}/other/2026/06/clip.mp4`,
        bucket: process.env.SUPABASE_STORAGE_BUCKET || "documents",
      }),
    ).rejects.toThrow("Unsupported video format.");
  });

  it("documents.createSignedUpload rejects dangerous MIME even with supported extension", async () => {
    const user = makeUser({ id: 106, role: "accountant", email: "acct6@test.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.documents.createSignedUpload({
        fileName: "clip.mp4",
        mimeType: "text/html",
        fileSize: 5 * 1024 * 1024,
        docType: "Other",
        year: 2026,
        month: 6,
      }),
    ).rejects.toThrow("Unsupported video format.");
  });
});
