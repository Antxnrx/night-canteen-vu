import "server-only";
import { createClient } from "@/lib/mongodb/client";
import { isMongoConfigured } from "@/lib/env";

export type SystemStatus = {
  mongoConfigured: boolean;
  dbReachable: boolean;
  itemCount: number | null;
  error: string | null;
};

/**
 * End-to-end health probe used by the landing page and `/api/health`.
 * Proves the app can reach MongoDB and read the menu through Row Level Security.
 * Degrades gracefully before MongoDB is configured (see SETUP.md).
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  if (!isMongoConfigured()) {
    return {
      mongoConfigured: false,
      dbReachable: false,
      itemCount: null,
      error: null,
    };
  }

  try {
    const supabase = await createClient();
    // Non-HEAD query so a missing table surfaces as an error (a HEAD count
    // request swallows the 404 and falsely looks reachable).
    const { count, error } = await supabase
      .from("menu_items")
      .select("id", { count: "exact" })
      .limit(1);

    if (error) {
      return {
        mongoConfigured: true,
        dbReachable: false,
        itemCount: null,
        error: error.message,
      };
    }

    return {
      mongoConfigured: true,
      dbReachable: true,
      itemCount: count ?? 0,
      error: null,
    };
  } catch (e) {
    return {
      mongoConfigured: true,
      dbReachable: false,
      itemCount: null,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
