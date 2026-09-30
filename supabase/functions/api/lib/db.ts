// =========================================================================
// A.KITCHEN DASHBOARD - SUPABASE CLIENT SINGLETON
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

// Đọc environment variables từ Deno.env (Supabase Edge Function) hoặc process.env
function getEnv(key: string): string {
  // @ts-ignore: Deno global
  if (typeof Deno !== "undefined" && Deno.env) {
    // @ts-ignore: Deno global
    return Deno.env.get(key) || "";
  }
  // @ts-ignore: Node process
  if (typeof process !== "undefined" && process.env) {
    // @ts-ignore: Node process
    return process.env[key] || "";
  }
  return "";
}

const supabaseUrl = getEnv("SUPABASE_URL");
const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("⚠️ SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY chưa được thiết lập!");
}

export const supabase = createClient(supabaseUrl || "http://localhost:54321", supabaseServiceKey || "dummy-key", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
