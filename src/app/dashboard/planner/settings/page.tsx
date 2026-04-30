"use client";

import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { Loader2, LogOut, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function specialtiesArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export default function PlannerSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const utils = trpc.useUtils();

  const { data: profile, isLoading: profileLoading } =
    trpc.profile.me.useQuery();
  const { data: planner, isLoading: plannerLoading } =
    trpc.planner.me.useQuery();

  // Profile form (basic)
  const [profileSeed, setProfileSeed] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  if (profile && profileSeed !== profile.id) {
    setProfileSeed(profile.id);
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
  }

  // Planner form (business)
  const [plannerSeed, setPlannerSeed] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [specialtyDraft, setSpecialtyDraft] = useState("");

  if (planner && plannerSeed !== planner.id) {
    setPlannerSeed(planner.id);
    setBusinessName(planner.business_name);
    setBio(planner.bio ?? "");
    setLocation(planner.location ?? "");
    setSpecialties(specialtiesArray(planner.specialties));
  }

  const profileUpdate = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.profile.me.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const plannerUpdate = trpc.planner.update.useMutation({
    onSuccess: () => {
      toast.success("Business profile updated");
      utils.planner.me.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSaveProfile = () => {
    profileUpdate.mutate({
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    });
  };

  const handleSavePlanner = () => {
    plannerUpdate.mutate({
      business_name: businessName.trim(),
      bio: bio.trim() || null,
      location: location.trim() || null,
      specialties,
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  function addSpecialty() {
    const v = specialtyDraft.trim();
    if (!v) return;
    if (specialties.includes(v)) {
      setSpecialtyDraft("");
      return;
    }
    if (specialties.length >= 20) {
      toast.error("Up to 20 specialties");
      return;
    }
    setSpecialties([...specialties, v]);
    setSpecialtyDraft("");
  }

  function onSpecialtyKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSpecialty();
    }
  }

  if (profileLoading || plannerLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
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
            Tune how couples discover you and how you appear on briefs.
          </p>
        </header>

        {/* Business profile */}
        <section className="mb-10 overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
          <div className="border-b border-rose-100/70 px-6 py-4">
            <h2 className="font-display text-lg font-medium tracking-tight">
              Business profile
            </h2>
            <p className="text-xs text-muted-foreground">
              This is what couples see when reviewing your proposal.
            </p>
          </div>
          <div className="space-y-5 p-6">
            {!planner && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
                You don&apos;t have a planner profile yet. Save the form below to
                start receiving briefs.
              </div>
            )}
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="business">Business name</Label>
                <Input
                  id="business"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Atelier of Anya"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  placeholder="Where are you based, what do you specialize in, what makes a Zaffa wedding feel like yours?"
                  className="resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  {bio.length}/2000
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Cairo, Egypt"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="specialty">Specialties</Label>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-input bg-transparent p-2">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800 ring-1 ring-rose-100"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() =>
                          setSpecialties(specialties.filter((x) => x !== s))
                        }
                        aria-label={`Remove ${s}`}
                        className="text-rose-700/70 hover:text-rose-900"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="specialty"
                    value={specialtyDraft}
                    onChange={(e) => setSpecialtyDraft(e.target.value)}
                    onKeyDown={onSpecialtyKey}
                    placeholder={
                      specialties.length === 0 ? "e.g. Beach weddings" : ""
                    }
                    className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addSpecialty}
                    className="gap-1"
                  >
                    <Plus className="size-3" />
                    Add
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Press Enter or comma to add.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={plannerUpdate.isPending || !businessName.trim()}
                onClick={handleSavePlanner}
                className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
              >
                {plannerUpdate.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save business profile
              </Button>
            </div>
          </div>
        </section>

        {/* Personal profile */}
        <section className="mb-10 overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 backdrop-blur-sm">
          <div className="border-b border-rose-100/70 px-6 py-4">
            <h2 className="font-display text-lg font-medium tracking-tight">
              Personal details
            </h2>
            <p className="text-xs text-muted-foreground">
              These show up alongside your messages.
            </p>
          </div>
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
                disabled={profileUpdate.isPending}
                onClick={handleSaveProfile}
                className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
              >
                {profileUpdate.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save personal details
              </Button>
            </div>
          </div>
        </section>

        <div className="space-y-3">
          <h2 className="font-display text-lg font-medium tracking-tight">
            Account
          </h2>
          <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-4 backdrop-blur-sm">
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
          <div className="rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Delete account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently remove your profile, portfolio, and all
                  proposals. Reach out to support to complete this.
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
