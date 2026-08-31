"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/mongodb/client";
import { isMongoConfigured } from "@/lib/env";
import { allow, clientIp } from "@/lib/rate-limit";
import { isValidIdentifier, toAdminEmail } from "@/lib/admin-identity";

const schema = z.object({
  username: z.string().min(1).max(254),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export type LoginState = { error: string | null };

/**
 * Sign-in throttling, in two buckets.
 *
 * By IP catches one machine working through a password list. By account catches
 * a distributed attempt against a single known username — the interesting case
 * here, since the staff username is effectively public once it's written on a
 * card by the till.
 *
 * The proxy also applies a coarse in-memory limit before this runs. This layer
 * is the authoritative one: it's in the database, so it holds across instances.
 */
const IP_LIMIT = { max: 10, windowSeconds: 15 * 60 };
const ACCOUNT_LIMIT = { max: 8, windowSeconds: 15 * 60 };

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Enter your username and password." };
  }
  if (!isMongoConfigured()) {
    return { error: "MongoDB isn't set up yet. See SETUP.md." };
  }

  const identifier = parsed.data.username.trim();
  if (!isValidIdentifier(identifier)) {
    return { error: "Incorrect username or password." };
  }
  const email = toAdminEmail(identifier);

  const ip = await clientIp();
  const [ipOk, accountOk] = await Promise.all([
    allow(`login:ip:${ip}`, IP_LIMIT.max, IP_LIMIT.windowSeconds),
    allow(`login:acct:${email}`, ACCOUNT_LIMIT.max, ACCOUNT_LIMIT.windowSeconds),
  ]);
  if (!ipOk || !accountOk) {
    return {
      error: "Too many sign-in attempts. Wait 15 minutes and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (error) {
    // Deliberately identical whether the account exists or the password is
    // wrong — never confirm which usernames are real.
    return { error: "Incorrect username or password." };
  }

  // Only honor internal /admin redirects.
  const next =
    parsed.data.next && parsed.data.next.startsWith("/admin")
      ? parsed.data.next
      : "/admin";
  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
