"use client";

import { use } from "react";
import { VenueDesigner } from "@/components/venue-designer/VenueDesigner";

export default function VenueDesignerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <VenueDesigner designId={id} />;
}
