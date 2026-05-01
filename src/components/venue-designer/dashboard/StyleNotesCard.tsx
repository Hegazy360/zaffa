"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";

export function StyleNotesCard() {
  const t = useTranslations("designer");
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes ?? "");
  const setStyleNotes = useVenueDesignerStore((s) => s.setStyleNotes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stepNotesTitle")}</CardTitle>
        <CardDescription>{t("styleNotesDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={styleNotes}
          onChange={(e) => setStyleNotes(e.target.value)}
          placeholder={t("styleNotesPlaceholder")}
          className="min-h-24 resize-none"
          maxLength={2000}
        />
        <div className="mt-1 text-end text-xs text-muted-foreground">
          {t("charCounter", { count: styleNotes.length, max: 2000 })}
        </div>
      </CardContent>
    </Card>
  );
}
