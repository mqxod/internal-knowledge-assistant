import { SignIn } from "@clerk/nextjs";
import { AuthLayout } from "@/components/layout/auth-layout";
import { RoleChooser } from "@/features/auth/components/role-chooser";

export default function SignInPage() {
  return (
    <AuthLayout>
      <RoleChooser mode="sign-in" />
      {/* Always land on "/", which routes to the home screen of the role in effect. */}
      <SignIn forceRedirectUrl="/" />
    </AuthLayout>
  );
}
