import "server-only";
import { createClient } from "@/lib/mongodb/client";
import { isMongoConfigured } from "@/lib/env";

export type AdminProfile = {
  user_id: string;
  display_name: string;
  role: string;
};

/**
 * Returns the current admin (auth user + profile) and an authed MongoDB
 * client, or null if not signed in / not an admin. Callers decide how to
 * respond (redirect for pages, error state for actions).
 */
export async function getCurrentAdmin() {
  if (!isMongoConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("user_id,display_name,role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return null;
  return { user, profile: profile as AdminProfile, supabase };
}
