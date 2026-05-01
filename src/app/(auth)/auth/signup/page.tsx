import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignUpForm } from "@/components/features/auth/signup-form";

export const metadata = {
  title: "Create Your Zaffa Account",
  description: "Sign up for a Zaffa account to get started",
};

export default async function SignUpPage() {
  const t = await getTranslations("auth");
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">{t("signUpTitle")}</CardTitle>
          <CardDescription>{t("signUpSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </div>
  );
}
