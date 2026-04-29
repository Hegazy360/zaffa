"use client";

import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import type { EventStatus, EventType } from "@/types";

interface EventCard {
  id: string;
  title: string;
  event_type: EventType;
  event_date: string;
  status: EventStatus;
  budget: number | null;
}

const mockEvents: EventCard[] = [
  {
    id: "1",
    title: "Ahmed & Sara's Wedding",
    event_type: "wedding",
    event_date: "2025-09-15",
    status: "planning",
    budget: 250000,
  },
  {
    id: "2",
    title: "Birthday Celebration",
    event_type: "birthday",
    event_date: "2025-06-20",
    status: "draft",
    budget: 15000,
  },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatEventType(type: EventType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getStatusVariant(
  status: EventStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "planning":
      return "default";
    case "draft":
      return "secondary";
    case "confirmed":
      return "default";
    case "completed":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

export default function ClientDashboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar role="client" />
        <main className="flex-1 flex flex-col min-w-0">
          <MobileSidebar role="client" />
          <div className="p-6 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Welcome back
                </h1>
                <p className="text-muted-foreground">
                  Manage your events and track your planning progress
                </p>
              </div>
              <Button render={<Link href="/dashboard/client/event/new" />} className="bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" />
                Create New Event
              </Button>
            </div>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Venue Designer</h2>
                <Button
                  variant="outline"
                  render={<Link href="/venue-designer" />}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  My Designs
                </Button>
              </div>
              <Card className="hover:ring-2 hover:ring-primary/20 transition-all">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="rounded-full bg-rose-50 p-3">
                    <Pencil className="h-6 w-6 text-rose-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">3D Venue Layout Designer</h3>
                    <p className="text-sm text-muted-foreground">
                      Design your venue layout in 3D, generate AI scenes, and create photorealistic renders
                    </p>
                  </div>
                  <Button
                    render={<Link href="/venue-designer/new" />}
                    className="bg-rose-500 hover:bg-rose-600 text-white gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New Design
                  </Button>
                </CardContent>
              </Card>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-4">My Events</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mockEvents.map((event) => (
                  <Link key={event.id} href={`/dashboard/client/event/${event.id}`}>
                    <Card className="hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer h-full">
                      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                        <CardTitle className="text-base">{event.title}</CardTitle>
                        <Badge variant={getStatusVariant(event.status)}>
                          {event.status.replace("_", " ")}
                        </Badge>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          {formatEventType(event.event_type)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(event.event_date)}
                        </p>
                        {event.budget && (
                          <p className="text-sm font-medium">
                            Budget: {formatCurrency(event.budget)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
