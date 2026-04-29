import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/features/auth/forgot-password-form";

export const metadata = {
  title: "Forgot Password",
  description: "Reset your Zaffa account password",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            Forgot your password?
          </CardTitle>
          <CardDescription>
            Enter the email associated with your account and we&apos;ll send you
            a link to reset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
