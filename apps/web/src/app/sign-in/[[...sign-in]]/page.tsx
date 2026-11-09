import { SignIn } from "@clerk/nextjs";
import { AuthLayout } from "@/components/layout/auth-layout";

export default function SignInPage() {
  return (
    <AuthLayout>
      <SignIn />
    </AuthLayout>
  );
}
