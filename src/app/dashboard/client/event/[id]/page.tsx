"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, MessageSquare, Calendar, Users, CheckSquare } from "lucide-react";
import type { BookingStatus } from "@/types";

interface EventDetail {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  venue: string | null;
  budget: number | null;
  status: string;
  planner: {
    business_name: string;
    full_name: string;
  } | null;
  vendors: Array<{
    id: string;
    business_name: string;
    category: string;
    status: BookingStatus;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    due_date: string;
    completed: boolean;
  }>;
}

const mockEvent: EventDetail = {
  id: "1",
  title: "Ahmed & Sara's Wedding",
  event_type: "Wedding",
  event_date: "2025-09-15",
  venue: "Sofitel Cairo El Gezirah",
  budget: 250000,
  status: "planning",
  planner: {
    business_name: "Dream Events Egypt",
    full_name: "Nour Hassan",
  },
  vendors: [
    {
      id: "v1",
      business_name: "Cairo Catering Co.",
      category: "Catering",
      status: "accepted",
    },
    {
      id: "v2",
      business_name: "Golden Lens Photography",
      category: "Photography",
      status: "pending",
    },
    {
      id: "v3",
      business_name: "Rose Garden Florists",
      category: "Flowers",
      status: "pending",
    },
  ],
  milestones: [
    { id: "m1", title: "Finalize guest list", due_date: "2025-06-01", completed: true },
    { id: "m2", title: "Book venue", due_date: "2025-06-15", completed: true },
    { id: "m3", title: "Confirm caterer", due_date: "2025-07-01", completed: false },
    { id: "m4", title: "Photography contract", due_date: "2025-07-15", completed: false },
    { id: "m5", title: "Floral design meeting", due_date: "2025-08-01", completed: false },
  ],
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getStatusVariant(
  status: BookingStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "accepted":
      return "default";
    case "pending":
      return "secondary";
    case "declined":
      return "destructive";
    case "completed":
      return "default";
    default:
      return "outline";
  }
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;
  const event = mockEvent;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar role="client" />
        <main className="flex-1 flex flex-col min-w-0">
          <MobileSidebar role="client" />
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" render={<Link href="/dashboard/client" />}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {event.title}
                </h1>
                <p className="text-muted-foreground">
                  {event.event_type} • {formatDate(event.event_date)}
                </p>
              </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="vendors">Vendors</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Event Details</CardTitle>
                      <CardDescription>Key information about your event</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Event Type
                        </p>
                        <p className="font-medium">{event.event_type}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Date
                        </p>
                        <p className="font-medium">{formatDate(event.event_date)}</p>
                      </div>
                      {event.venue && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Venue
                          </p>
                          <p className="font-medium">{event.venue}</p>
                        </div>
                      )}
                      {event.budget && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Budget
                          </p>
                          <p className="font-medium">
                            {formatCurrency(event.budget)}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Status
                        </p>
                        <Badge>{event.status}</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Planner</CardTitle>
                      <CardDescription>
                        Your event planner for this occasion
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {event.planner ? (
                        <div className="space-y-2">
                          <p className="font-medium">{event.planner.business_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {event.planner.full_name}
                          </p>
                          <Button variant="outline" size="sm" className="mt-2">
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Message Planner
                          </Button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">
                          No planner assigned yet
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="vendors" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Assigned Vendors</CardTitle>
                    <CardDescription>
                      Vendors working on your event and their status
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {event.vendors.map((vendor) => (
                        <div
                          key={vendor.id}
                          className="flex items-center justify-between rounded-lg border p-4"
                        >
                          <div>
                            <p className="font-medium">{vendor.business_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {vendor.category}
                            </p>
                          </div>
                          <Badge variant={getStatusVariant(vendor.status)}>
                            {vendor.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Planning Timeline</CardTitle>
                    <CardDescription>
                      Milestones and checklist for your event
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {event.milestones.map((milestone) => (
                        <div
                          key={milestone.id}
                          className="flex items-center gap-4 rounded-lg border p-4"
                        >
                          <CheckSquare
                            className={`h-5 w-5 ${
                              milestone.completed
                                ? "text-green-600"
                                : "text-muted-foreground"
                            }`}
                          />
                          <div className="flex-1">
                            <p
                              className={
                                milestone.completed
                                  ? "font-medium line-through text-muted-foreground"
                                  : "font-medium"
                              }
                            >
                              {milestone.title}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Due: {formatDate(milestone.due_date)}
                            </p>
                          </div>
                          {milestone.completed && (
                            <Badge variant="secondary">Done</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="messages" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Messages</CardTitle>
                    <CardDescription>
                      Chat with your planner and vendors
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">
                        Messages will appear here once you start chatting with
                        your planner and vendors.
                      </p>
                      <Button className="mt-4">Start a conversation</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
