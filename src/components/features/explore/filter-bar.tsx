"use client";

import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface ExploreFilters {
  eventType?: string;
  style?: string;
  search?: string;
}

interface FilterBarProps {
  filters: ExploreFilters;
  onFilterChange: (filters: ExploreFilters) => void;
}

const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "engagement", label: "Engagement" },
  { value: "birthday", label: "Birthday" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Other" },
];

const STYLE_TAGS = [
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
  { value: "bohemian", label: "Bohemian" },
  { value: "luxury", label: "Luxury" },
  { value: "minimalist", label: "Minimalist" },
  { value: "rustic", label: "Rustic" },
  { value: "romantic", label: "Romantic" },
  { value: "tropical", label: "Tropical" },
];

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  const hasActiveFilters =
    filters.eventType || filters.style || filters.search;

  const clearFilters = () => {
    onFilterChange({
      eventType: undefined,
      style: undefined,
      search: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search arrangements..."
            value={filters.search ?? ""}
            onChange={(e) =>
              onFilterChange({ ...filters, search: e.target.value || undefined })
            }
            className="pl-9 h-9"
          />
        </div>

        <Select
          value={filters.eventType ?? ""}
          onValueChange={(value) =>
            onFilterChange({
              ...filters,
              eventType: value || undefined,
            })
          }
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.style ?? ""}
          onValueChange={(value) =>
            onFilterChange({
              ...filters,
              style: value || undefined,
            })
          }
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Style" />
          </SelectTrigger>
          <SelectContent>
            {STYLE_TAGS.map((tag) => (
              <SelectItem key={tag.value} value={tag.value}>
                {tag.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Badge
            variant="outline"
            className="cursor-pointer hover:bg-muted transition-colors"
            onClick={clearFilters}
          >
            Clear filters
          </Badge>
        )}
      </div>
    </div>
  );
}
