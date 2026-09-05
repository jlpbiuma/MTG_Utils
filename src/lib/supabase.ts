import { createClient } from "@supabase/supabase-js";

// Client-side / Public Supabase client (only uses public anon/publishable key)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side admin client (uses private service role key - NEVER EXPORTED OR IMPORTED IN CLIENT COMPONENTS)
export function getAdminSupabaseClient() {
  if (typeof window !== "undefined") {
    throw new Error("CRITICAL SECURITY ERROR: getAdminSupabaseClient cannot be called from the browser!");
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing in server environment.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
