"use client";

import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MessageSquare, Star, TrendingUp } from "lucide-react";

interface Inquiry {
  id: string;
  client_name: string;
  event_type: string;
  event_date: string;
  status: "pending" | "responded";
  message: string;
}

interface PlannerEvent {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  status: string;
  client_name: string;
}

const mockStats = {
  activeEvents: 5,
  pendingInquiries: 3,
  totalReviews: 42,
  rating: 4.8,
};

const mockInquiries: Inquiry[] = [
  {
    id: "1",
    client_name: "Ahmed Mohamed",
    event_type: "Wedding",
    event_date: "2025-10-20",
    status: "pending",
    message: "Looking for full wedding planning services for 200 guests...",
  },
  {
    id: "2",
    client_name: "Sara Hassan",
    event_type: "Engagement",
    event_date: "2025-08-15",
    status: "responded",
    message: "Interested in engagement party planning...",
  },
];

const mockEvents: PlannerEvent[] = [
  {
    id: "1",
    title: "Ahmed & Sara's Wedding",
    event_type: "Wedding",
    event_date: "2025-09-15",
    status: "planning",
    client_name: "Ahmed Mohamed",
  },
  {
    id: "2",
    title: "Corporate Gala",
    event_type: "Corporate",
    event_date: "2025-07-10",
    status: "confirmed",
    client_name: "Tech Solutions Egypt",
  },
  {
    id: "3",
    title: "Birthday Celebration",
    event_type: "Birthday",
    event_date: "2025-06-20",
    status: "planning",
    client_name: "Layla Ibrahim",
  },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PlannerDashboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar role="planner" />
        <main className="flex-1 flex flex-col min-w-0">
          <MobileSidebar role="planner" />
          <div className="p-6 space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Planner Dashboard
              </h1>
              <p className="text-muted-foreground">
                Overview of your events and inquiries
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Active Events
                  </CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mockStats.activeEvents}</div>
                  <p className="text-xs text-muted-foreground">
                    Events in planning
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Pending Inquiries
                  </CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockStats.pendingInquiries}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Awaiting response
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Reviews
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockStats.totalReviews}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Client feedback
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rating</CardTitle>
                  <Star className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mockStats.rating}</div>
                  <p className="text-xs text-muted-foreground">
                    Average rating
                  </p>
                </CardContent>
              </Card>
            </div>

            <section>
              <h2 className="text-lg font-semibold mb-4">Recent Inquiries</h2>
              <div className="space-y-4">
                {mockInquiries.map((inquiry) => (
                  <Card key={inquiry.id} className="hover:ring-2 hover:ring-primary/20 transition-all">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {inquiry.client_name}
                          </CardTitle>
                          <CardDescription>
                            {inquiry.event_type} • {formatDate(inquiry.event_date)}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={
                            inquiry.status === "pending"
                              ? "secondary"
                              : "default"
                          }
                        >
                          {inquiry.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {inquiry.message}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-4">Active Events</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mockEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/dashboard/planner/events/${event.id}`}
                  >
                    <Card className="hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{event.title}</CardTitle>
                        <CardDescription>
                          {event.client_name} • {formatDate(event.event_date)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Badge variant="outline">{event.status}</Badge>
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
