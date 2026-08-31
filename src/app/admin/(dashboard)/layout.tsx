import { redirect } from "next/navigation";
import { createClient } from "@/lib/mongodb/client";
import { isMongoConfigured } from "@/lib/env";
import { getStoreOpen } from "@/lib/store";
import { signOut } from "@/lib/actions/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import type { AdminProfile } from "@/lib/admin";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Before MongoDB is wired, show a setup hint instead of crashing.
  if (!isMongoConfigured()) {
    return (
      <div className="flex min-h-full items-center justify-center bg-primary-deep px-5 py-16">
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-float">
          <h1 className="text-lg font-semibold text-foreground">
            Almost there
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Connect MongoDB to use the admin. Follow the steps in{" "}
            <span className="font-medium">SETUP.md</span>.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in → login (middleware also guards this).
  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("user_id,display_name,role")
    .eq("user_id", user.id)
    .maybeSingle();

  // Signed in but not a staff account → dead-end with a way out (no loop).
  if (!profile) {
    return (
      <div className="flex min-h-full items-center justify-center bg-primary-deep px-5 py-16">
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-float">
          <h1 className="text-lg font-semibold text-foreground">
            Not authorized
          </h1>
          <p className="mb-5 mt-1.5 text-sm text-muted">
            <span className="font-medium">{user.email}</span> isn&rsquo;t set up
            as Night Canteen staff. Ask an owner to add you.
          </p>
          <form action={signOut}>
            <Button variant="secondary" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const storeOpen = await getStoreOpen();

  return (
    <AdminShell profile={profile as AdminProfile} storeOpen={storeOpen}>
      {children}
    </AdminShell>
  );
}
