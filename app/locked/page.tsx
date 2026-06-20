import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import LockedScreen from "@/components/LockedScreen";

export const dynamic = "force-dynamic";

export default async function LockedPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.must_change_password) redirect("/change-password");
  if (profile.role === "admin") redirect("/dashboard");

  // 이미 공개됐으면 들어가게
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("is_public")
    .eq("id", 1)
    .single();
  if (settings?.is_public) redirect("/dashboard");

  return <LockedScreen displayName={profile.display_name} />;
}
