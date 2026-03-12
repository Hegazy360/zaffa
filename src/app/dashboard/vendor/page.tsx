"use client";

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
import { Briefcase, Calendar, CheckCircle, Inbox } from "lucide-react";

interface VendorService {
  id: string;
  name: string;
  description: string;
  price_from: number;
  price_unit: string;
}

interface IncomingRequest {
  id: string;
  event_title: string;
  event_date: string;
  client_name: string;
  status: "pending" | "accepted" | "declined";
}

const mockStats = {
  activeServices: 5,
  pendingRequests: 2,
  completedEvents: 12,
};

const mockServices: VendorService[] = [
  {
    id: "1",
    name: "Wedding Catering Package",
    description: "Full buffet for up to 200 guests with appetizers, main course, and dessert",
    price_from: 150,
    price_unit: "per_person",
  },
  {
    id: "2",
    name: "Premium Dessert Table",
    description: "Custom dessert display with cakes, pastries, and sweets",
    price_from: 5000,
    price_unit: "per_event",
  },
  {
    id: "3",
    name: "Corporate Lunch Package",
    description: "Business lunch catering for meetings and corporate events",
    price_from: 80,
    price_unit: "per_person",
  },
];

const mockRequests: IncomingRequest[] = [
  {
    id: "1",
    event_title: "Ahmed & Sara's Wedding",
    event_date: "2025-09-15",
    client_name: "Ahmed Mohamed",
    status: "pending",
  },
  {
    id: "2",
    event_title: "Corporate Gala",
    event_date: "2025-07-10",
    client_name: "Tech Solutions Egypt",
    status: "pending",
  },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPrice(amount: number, unit: string): string {
  const formatted = new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 0,
  }).format(amount);
  const unitLabel = unit === "per_person" ? "per person" : "per event";
  return `${formatted} ${unitLabel}`;
}

export default function VendorDashboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar role="vendor" />
        <main className="flex-1 flex flex-col min-w-0">
          <MobileSidebar role="vendor" />
          <div className="p-6 space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Vendor Dashboard
              </h1>
              <p className="text-muted-foreground">
                Manage your services and incoming requests
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Active Services
                  </CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockStats.activeServices}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Listed services
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Pending Requests
                  </CardTitle>
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockStats.pendingRequests}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Awaiting response
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Completed Events
                  </CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockStats.completedEvents}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total completed
                  </p>
                </CardContent>
              </Card>
            </div>

            <section>
              <h2 className="text-lg font-semibold mb-4">My Services</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mockServices.map((service) => (
                  <Card key={service.id} className="h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{service.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {service.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-primary">
                        From {formatPrice(service.price_from, service.price_unit)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-4">Incoming Requests</h2>
              <div className="space-y-4">
                {mockRequests.map((request) => (
                  <Card key={request.id} className="hover:ring-2 hover:ring-primary/20 transition-all">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {request.event_title}
                          </CardTitle>
                          <CardDescription>
                            {request.client_name} •{" "}
                            {formatDate(request.event_date)}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={
                            request.status === "pending"
                              ? "secondary"
                              : "default"
                          }
                        >
                          {request.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">
                          Accept
                        </Badge>
                        <Badge variant="destructive" className="cursor-pointer">
                          Decline
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
