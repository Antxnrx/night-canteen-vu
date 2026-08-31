import { NextResponse } from "next/server";
import { getSystemStatus } from "@/lib/health";

// Live probe — never cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/health — JSON health probe for deploys/monitoring.
 * `ok` reflects whether the DB is reachable once MongoDB is configured.
 */
export async function GET() {
  const status = await getSystemStatus();
  const ok = status.mongoConfigured ? status.dbReachable : false;
  return NextResponse.json({ ok, ...status });
}
