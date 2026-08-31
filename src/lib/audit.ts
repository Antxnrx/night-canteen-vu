import "server-only";
import type { createAdminClient } from "@/lib/mongodb/client";

type AuditEntry = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Records a sensitive admin action. Inserted through the admin's own authed
 * client so RLS ties the row to auth.uid(). Never throws into the caller —
 * a failed audit write must not fail the underlying action.
 */
export async function logAudit(
  supabase: ReturnType<typeof createAdminClient>,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    summary: entry.summary ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  if (error) {
    console.error("audit_log insert failed:", error.message);
  }
}
