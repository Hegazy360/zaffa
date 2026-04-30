"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const utils = trpc.useUtils();

  const { data: profile, isLoading } = trpc.profile.me.useQuery();

  // Track which profile snapshot the local form was seeded from. When the
  // server returns a different one (first load, or after a fresh fetch), we
  // re-derive the inputs without an effect — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  if (profile && seededFor !== profile.id) {
    setSeededFor(profile.id);
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
  }

  const update = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.profile.me.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    update.mutate({
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <header className="mb-10 space-y-3">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            Your account
          </p>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            Settings
          </h1>
          <p className="max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
            Update how you appear to your planner and vendors.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/80">
          <div className="space-y-5 p-6">
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={fullName || "avatar"}
                  className="size-16 rounded-full object-cover ring-1 ring-rose-200/60"
                />
              ) : (
                <div className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-xl font-semibold text-rose-800">
                  {fullName.charAt(0) || "?"}
                </div>
              )}
              <div>
                <p className="font-display text-lg font-medium leading-tight tracking-tight">
                  {fullName || "Your name"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {profile?.email}
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="full-name">Full name</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={profile?.email ?? ""}
                  disabled
                  className="bg-muted/50"
                />
                <p className="text-[11px] text-muted-foreground">
                  Email is tied to your sign-in account.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+20 …"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avatar">Avatar URL</Label>
                <Input
                  id="avatar"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                disabled={update.isPending}
                onClick={handleSave}
                className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
              >
                {update.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save changes
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <h2 className="font-display text-lg font-medium tracking-tight">
            Account
          </h2>
          <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-4 backdrop-blur-sm dark:border-rose-900/30 dark:bg-card/70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-xs text-muted-foreground">
                  End this session on this device.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="gap-1"
              >
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4 dark:border-stone-800 dark:bg-card/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Delete account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently remove your profile and all associated events.
                  Reach out to support to complete this.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Contact support
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
