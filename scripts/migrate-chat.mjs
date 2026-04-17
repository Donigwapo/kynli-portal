import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

// Use the Supabase Management API to run raw SQL
// The /rest/v1/rpc approach doesn't support DDL; we use the pg REST endpoint instead
const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  },
  body: JSON.stringify({
    query: `
      ALTER TABLE grit_media_group_llc_chat
        ADD COLUMN IF NOT EXISTS sender_user_id INTEGER,
        ADD COLUMN IF NOT EXISTS file_key TEXT,
        ADD COLUMN IF NOT EXISTS file_url TEXT,
        ADD COLUMN IF NOT EXISTS file_name TEXT,
        ADD COLUMN IF NOT EXISTS file_size BIGINT,
        ADD COLUMN IF NOT EXISTS mime_type TEXT,
        ADD COLUMN IF NOT EXISTS archive_year INTEGER,
        ADD COLUMN IF NOT EXISTS archive_month INTEGER,
        ADD COLUMN IF NOT EXISTS portal_document_id INTEGER;
    `,
  }),
});

if (!response.ok) {
  const err = await response.text();
  console.log("exec_sql RPC not available:", err);
  console.log("\n--- MANUAL STEP REQUIRED ---");
  console.log("Please run the following SQL in your Supabase SQL Editor:");
  console.log(`
ALTER TABLE grit_media_group_llc_chat
  ADD COLUMN IF NOT EXISTS sender_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS file_key TEXT,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS archive_year INTEGER,
  ADD COLUMN IF NOT EXISTS archive_month INTEGER,
  ADD COLUMN IF NOT EXISTS portal_document_id INTEGER;
  `);
} else {
  console.log("Migration applied successfully!");
}
