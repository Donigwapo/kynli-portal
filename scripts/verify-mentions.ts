import fs from "node:fs";
import path from "node:path";

function loadSupabaseEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key === "SUPABASE_URL" || key === "SUPABASE_SERVICE_ROLE_KEY") {
      process.env[key] = value;
    }
  }
}

loadSupabaseEnv();

const { appRouter } = await import("../server/routers");
const { supabase } = await import("../server/supabase");

type PortalUser = {
  id: number;
  supabase_uid: string | null;
  email: string;
  name: string | null;
  role: "admin" | "accounting_manager" | "tax_manager" | "accountant" | "client";
  tenant_slug: string | null;
  must_reset_password: boolean;
  invite_sent_at?: string | null;
  invite_accepted?: boolean;
  created_at: string;
  updated_at: string;
};

function ctxFor(user: PortalUser) {
  return {
    user,
    req: { headers: {}, protocol: "https" } as any,
    res: { clearCookie: () => {} } as any,
  } as any;
}

async function getNotificationsByMessage(messageId: number) {
  const { data, error } = await supabase
    .from("portal_notifications")
    .select("id,recipient_user_id,sender_user_id,notification_type,title,content,tenant_slug,assignment_id,dm_key,chat_message_id,thread_parent_id,target_path,is_read,created_at")
    .eq("chat_message_id", messageId)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function run() {
  const scenarios: Array<{
    scenario: string;
    expectedRecipient: number | string;
    actualNotificationRows: any[];
    pass: boolean;
    note?: string;
  }> = [];

  const migrationProbe = await supabase.from("portal_notifications").select("id").limit(1);
  if (migrationProbe.error) {
    console.log(JSON.stringify({ migrationApplied: false, error: migrationProbe.error.message, scenarios: [] }, null, 2));
    return;
  }

  const { data: users, error: usersErr } = await supabase
    .from("portal_users")
    .select("id,supabase_uid,email,name,role,tenant_slug,must_reset_password,created_at,updated_at")
    .order("id", { ascending: true });
  if (usersErr) throw new Error(usersErr.message);
  const allUsers = (users ?? []) as PortalUser[];

  const admin = allUsers.find((u) => u.role === "admin");
  if (!admin) throw new Error("No admin user found");

  const staffUser = allUsers.find((u) => ["accountant", "tax_manager", "accounting_manager"].includes(u.role));
  if (!staffUser) throw new Error("No staff user found");

  const caller = appRouter.createCaller(ctxFor(admin));

  const { data: assignments, error: assignmentsErr } = await supabase
    .from("staff_client_assignments")
    .select("id,staff_id,tenant_slug")
    .order("id", { ascending: true });
  if (assignmentsErr) throw new Error(assignmentsErr.message);
  const assignmentRows = (assignments ?? []) as Array<{ id: number; staff_id: number; tenant_slug: string }>;
  const firstAssignment = assignmentRows[0];
  if (!firstAssignment) throw new Error("No staff assignments found");

  const tenantSlug = firstAssignment.tenant_slug;
  const assignmentId = Number(firstAssignment.id);

  const assignedStaffIds = new Set(
    assignmentRows
      .filter((a) => a.tenant_slug === tenantSlug)
      .map((a) => Number(a.staff_id)),
  );
  const outsider = allUsers.find(
    (u) =>
      Number(u.id) !== Number(admin.id) &&
      Number(u.id) !== Number(firstAssignment.staff_id) &&
      !assignedStaffIds.has(Number(u.id)) &&
      u.tenant_slug !== tenantSlug,
  );

  // 1. Internal Team Chat mention
  {
    const candidates = (await caller.chat.mentionCandidates({ tenantSlug: "kynli_internal" })) as Array<any>;
    const recipient = candidates.find((c) => Number(c.id) !== Number(admin.id));
    if (!recipient) throw new Error("No internal mention candidate");
    const msg: any = await caller.chat.send({ tenantSlug: "kynli_internal", body: `verify s1 @${recipient.displayName}` });
    const rows = await getNotificationsByMessage(Number(msg.id));
    scenarios.push({
      scenario: "1. Mention in Internal Team Chat",
      expectedRecipient: Number(recipient.id),
      actualNotificationRows: rows,
      pass: rows.some((r) => Number(r.recipient_user_id) === Number(recipient.id)),
    });
  }

  // 2. Tenant Group Chat mention
  {
    const candidates = (await caller.chat.mentionCandidates({ tenantSlug })) as Array<any>;
    const recipient = candidates.find((c) => Number(c.id) !== Number(admin.id));
    if (!recipient) throw new Error("No tenant mention candidate");
    const msg: any = await caller.chat.send({ tenantSlug, body: `verify s2 @${recipient.displayName}` });
    const rows = await getNotificationsByMessage(Number(msg.id));
    scenarios.push({
      scenario: "2. Mention in Tenant Group Chat",
      expectedRecipient: Number(recipient.id),
      actualNotificationRows: rows,
      pass: rows.some((r) => Number(r.recipient_user_id) === Number(recipient.id) && r.assignment_id == null && !r.dm_key),
    });
  }

  // 3. Assignment lane mention
  {
    const candidates = (await caller.chat.mentionCandidates({ tenantSlug, assignmentId })) as Array<any>;
    const recipient = candidates.find((c) => Number(c.id) !== Number(admin.id));
    if (!recipient) throw new Error("No assignment mention candidate");
    const msg: any = await caller.chat.send({ tenantSlug, assignmentId, body: `verify s3 @${recipient.displayName}` });
    const rows = await getNotificationsByMessage(Number(msg.id));
    scenarios.push({
      scenario: "3. Mention in Assignment/Client lane",
      expectedRecipient: Number(recipient.id),
      actualNotificationRows: rows,
      pass: rows.some((r) => Number(r.recipient_user_id) === Number(recipient.id) && Number(r.assignment_id) === assignmentId),
    });
  }

  // 4. DM mention
  {
    const resolved: any = await caller.chat.resolveDm({ tenantSlug: "kynli_internal", peerUserId: Number(staffUser.id) });
    const dmKey = String(resolved.dmKey);
    const label = (staffUser.name || staffUser.email || `User ${staffUser.id}`).trim();
    const msg: any = await caller.chat.send({ tenantSlug: "kynli_internal", dmKey, body: `verify s4 @${label}` });
    const rows = await getNotificationsByMessage(Number(msg.id));
    scenarios.push({
      scenario: "4. Mention in DM",
      expectedRecipient: Number(staffUser.id),
      actualNotificationRows: rows,
      pass: rows.some((r) => Number(r.recipient_user_id) === Number(staffUser.id) && String(r.dm_key || "") === dmKey),
    });
  }

  // 5. Mention in reply/thread
  {
    const candidates = (await caller.chat.mentionCandidates({ tenantSlug })) as Array<any>;
    const recipient = candidates.find((c) => Number(c.id) !== Number(admin.id));
    if (!recipient) throw new Error("No thread mention candidate");
    const parent: any = await caller.chat.send({ tenantSlug, body: "verify s5 parent" });
    const reply: any = await caller.chat.sendReply({ tenantSlug, parentId: Number(parent.id), body: `verify s5 @${recipient.displayName}` });
    const rows = await getNotificationsByMessage(Number(reply.id));
    scenarios.push({
      scenario: "5. Mention in reply/thread",
      expectedRecipient: Number(recipient.id),
      actualNotificationRows: rows,
      pass: rows.some((r) => Number(r.recipient_user_id) === Number(recipient.id) && Number(r.thread_parent_id) === Number(parent.id)),
    });
  }

  // 6. Self-mention
  {
    const selfLabel = (admin.name || admin.email || `User ${admin.id}`).trim();
    const msg: any = await caller.chat.send({ tenantSlug, body: `verify s6 @${selfLabel}` });
    const rows = await getNotificationsByMessage(Number(msg.id));
    scenarios.push({
      scenario: "6. Self-mention does not notify self",
      expectedRecipient: "none",
      actualNotificationRows: rows,
      pass: rows.length === 0 || rows.every((r) => Number(r.recipient_user_id) !== Number(admin.id)),
    });
  }

  // 7. Duplicate mentions in one message
  {
    const candidates = (await caller.chat.mentionCandidates({ tenantSlug })) as Array<any>;
    const recipient = candidates.find((c) => Number(c.id) !== Number(admin.id));
    if (!recipient) throw new Error("No dedupe mention candidate");
    const msg: any = await caller.chat.send({ tenantSlug, body: `verify s7 @${recipient.displayName} ... @${recipient.displayName}` });
    const rows = await getNotificationsByMessage(Number(msg.id));
    const count = rows.filter((r) => Number(r.recipient_user_id) === Number(recipient.id)).length;
    scenarios.push({
      scenario: "7. Duplicate mentions in one message create only one notification",
      expectedRecipient: Number(recipient.id),
      actualNotificationRows: rows,
      pass: count === 1,
    });
  }

  // 8. Users without access do not receive notifications
  {
    let pass = false;
    let rows: any[] = [];
    let note = "No outsider user available to validate";

    if (outsider) {
      const outsiderLabel = (outsider.name || outsider.email || `User ${outsider.id}`).trim();
      const candidates = (await caller.chat.mentionCandidates({ tenantSlug })) as Array<any>;
      const msg: any = await caller.chat.send({ tenantSlug, body: `verify s8 @${outsiderLabel}` });
      rows = await getNotificationsByMessage(Number(msg.id));
      pass = !candidates.some((c) => Number(c.id) === Number(outsider.id)) && !rows.some((r) => Number(r.recipient_user_id) === Number(outsider.id));
      note = `outsider=${outsider.id}`;
    }

    scenarios.push({
      scenario: "8. Users without chat access do not receive notifications",
      expectedRecipient: outsider ? `none for outsider ${outsider.id}` : "none",
      actualNotificationRows: rows,
      pass,
      note,
    });
  }

  console.log(JSON.stringify({ migrationApplied: true, scenarios }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
