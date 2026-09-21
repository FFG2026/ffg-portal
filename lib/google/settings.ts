import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSetting(supabase: SupabaseClient, key: string) {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value || "";
}

export async function setSetting(
  supabase: SupabaseClient,
  key: string,
  value: string
) {
  const { error } = await supabase.from("admin_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteSetting(supabase: SupabaseClient, key: string) {
  const { error } = await supabase.from("admin_settings").delete().eq("key", key);
  if (error) throw error;
}
