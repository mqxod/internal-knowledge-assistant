import { SignUp } from "@clerk/nextjs";
import { AuthLayout } from "@/components/layout/auth-layout";
import { RoleChooser } from "@/features/auth/components/role-chooser";

export default function SignUpPage() {
  return (
    <AuthLayout note="Use your work email. Admin access is only granted to approved administrator addresses; everyone else joins as a member.">
      <RoleChooser mode="sign-up" />
      <SignUp forceRedirectUrl="/" />
    </AuthLayout>
  );
}
