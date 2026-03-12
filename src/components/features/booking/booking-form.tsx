"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BookingFormProps {
  plannerId: string;
  plannerName: string;
}

const EVENT_TYPES = [
  "wedding",
  "engagement",
  "birthday",
  "corporate",
  "other",
];

export function BookingForm({ plannerId, plannerName }: BookingFormProps) {
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [venue, setVenue] = useState("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    // TODO: Submit to API
    setShowConfirm(false);
    setEventTitle("");
    setEventType("");
    setEventDate("");
    setVenue("");
    setBudget("");
    setMessage("");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Book {plannerName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill in your event details to request a consultation.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="event-title">Event Title</Label>
              <Input
                id="event-title"
                placeholder="e.g. Sarah & Ahmed's Wedding"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="event-type">Event Type</Label>
              <Select value={eventType} onValueChange={(v) => setEventType(v ?? "")} required>
                <SelectTrigger id="event-type" className="mt-1.5 w-full">
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="event-date">Event Date</Label>
              <Input
                id="event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="venue">Venue</Label>
              <Input
                id="venue"
                placeholder="Venue name or TBD"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="budget">Budget (EGP)</Label>
              <Input
                id="budget"
                type="number"
                placeholder="e.g. 150000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                min={0}
                step={1000}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="message">Message to Planner</Label>
              <Textarea
                id="message"
                placeholder="Tell the planner about your vision..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="mt-1.5"
              />
            </div>

            <Button type="submit" className="w-full">
              Request Booking
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Booking Request</DialogTitle>
            <DialogDescription>
              You are requesting to book {plannerName} for your event. Please
              review the details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4 text-sm">
            <p>
              <span className="font-medium">Event:</span> {eventTitle}
            </p>
            <p>
              <span className="font-medium">Type:</span>{" "}
              {eventType.charAt(0).toUpperCase() + eventType.slice(1)}
            </p>
            <p>
              <span className="font-medium">Date:</span> {eventDate}
            </p>
            <p>
              <span className="font-medium">Venue:</span> {venue || "—"}
            </p>
            <p>
              <span className="font-medium">Budget:</span>{" "}
              {budget ? `${Number(budget).toLocaleString()} EGP` : "—"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
