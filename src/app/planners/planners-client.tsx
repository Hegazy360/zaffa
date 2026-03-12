"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PlannerCard, type PlannerCardData } from "@/components/features/planners/planner-card";

interface PlannersPageClientProps {
  planners: PlannerCardData[];
}

export function PlannersPageClient({ planners }: PlannersPageClientProps) {
  const [search, setSearch] = useState("");

  const filteredPlanners = planners.filter((planner) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      planner.business_name.toLowerCase().includes(query) ||
      planner.profiles.full_name.toLowerCase().includes(query) ||
      planner.location?.toLowerCase().includes(query) ||
      planner.specialties.some((s) => s.toLowerCase().includes(query)) ||
      planner.bio?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, location, or specialty..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPlanners.map((planner) => (
          <PlannerCard key={planner.id} planner={planner} />
        ))}
      </div>

      {filteredPlanners.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No planners match your search.</p>
          <p className="text-sm mt-2">Try adjusting your search terms.</p>
        </div>
      )}
    </div>
  );
}
