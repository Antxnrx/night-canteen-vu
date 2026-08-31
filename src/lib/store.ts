import "server-only";
import { createAdminClient } from "@/lib/mongodb/client";
import { isMongoConfigured } from "@/lib/env";

/** Whether the canteen is currently accepting orders. Defaults open. */
export async function getStoreOpen(): Promise<boolean> {
  if (!isMongoConfigured()) return true;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("store_settings")
    .select("is_open")
    .eq("id", 1)
    .maybeSingle();
  return data?.is_open ?? true;
}
