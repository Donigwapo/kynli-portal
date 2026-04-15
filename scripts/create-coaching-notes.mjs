/**
 * Creates the {slug}_coaching_notes table in Supabase for free-text quarterly coaching content.
 * Run: node scripts/create-coaching-notes.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// We'll use the Supabase SQL endpoint via fetch since createClient doesn't expose raw SQL
const sql = `
CREATE TABLE IF NOT EXISTS grit_media_group_llc_coaching_notes (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (year, quarter)
);
`;

const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
  },
  body: JSON.stringify({ sql }),
});

if (!response.ok) {
  // Try direct SQL via the pg endpoint
  console.log("RPC approach failed, trying direct insert test...");
  
  // Test if table already exists by trying to select from it
  const { data, error } = await supabase
    .from("grit_media_group_llc_coaching_notes")
    .select("id")
    .limit(1);
  
  if (error && error.code === "42P01") {
    console.log("Table does not exist. Please run this SQL in the Supabase dashboard:");
    console.log(sql);
  } else if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("Table already exists!");
  }
} else {
  console.log("Table created successfully!");
}
