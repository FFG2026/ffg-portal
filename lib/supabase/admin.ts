import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// This client uses the SERVICE ROLE key, which bypasses row-level
// security entirely. It must NEVER be imported into any client
// component or exposed to the browser -- server-side use only
// (API routes, webhooks). That's why the key it reads is NOT
// prefixed with NEXT_PUBLIC_.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
