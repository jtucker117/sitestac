import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "https://kbsjugijwmjpattzfmgi.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  process.exit(1);
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
