import { SignUp } from "@clerk/nextjs";
import { AuthLayout } from "@/components/layout/auth-layout";

export default function SignUpPage() {
  return (
    <AuthLayout note="Sign up with your work email. New accounts join as members; administrators manage uploads.">
      <SignUp />
    </AuthLayout>
  );
}
