import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // 이미 변경한 사용자가 직접 들어오면 대시보드로
  if (!profile.must_change_password) redirect("/dashboard");

  return <ChangePasswordForm displayName={profile.display_name} />;
}
