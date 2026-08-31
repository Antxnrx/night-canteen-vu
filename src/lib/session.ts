import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/mongodb/client";

const COOKIE = "nc_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type CustomerSession = {
  id: string;
  name: string;
  phone: string | null;
};

/** Reads the current customer session from the cookie, or null. Read-only —
 * safe to call from Server Components. */
export async function getSession(): Promise<CustomerSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("customer_sessions")
    .select("id,name,phone,expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { id: data.id, name: data.name, phone: data.phone };
}

/**
 * Ensures a customer session exists, updating the name/phone. Sets the httpOnly
 * cookie — call ONLY from Server Actions / Route Handlers (which may set cookies).
 */
export async function ensureSession(
  name: string,
  phone: string | null,
): Promise<CustomerSession> {
  const jar = await cookies();
  const existingToken = jar.get(COOKIE)?.value;
  const supabase = createAdminClient();

  if (existingToken) {
    const { data } = await supabase
      .from("customer_sessions")
      .select("id")
      .eq("token", existingToken)
      .maybeSingle();
    if (data) {
      await supabase
        .from("customer_sessions")
        .update({ name, phone, last_seen_at: new Date().toISOString() })
        .eq("id", data.id);
      return { id: data.id, name, phone };
    }
  }

  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase
    .from("customer_sessions")
    .insert({
      token,
      name,
      phone,
      last_seen_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("customer_sessions insert failed:", error?.message ?? "no data");
    throw new Error("Could not create session");
  }

  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return { id: data.id, name, phone };
}
