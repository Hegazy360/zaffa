export type UserRole = "client" | "planner" | "vendor";

export type EventType =
  | "wedding"
  | "engagement"
  | "birthday"
  | "corporate"
  | "other";

export type EventStatus =
  | "draft"
  | "planning"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export type VendorCategory =
  | "catering"
  | "photography"
  | "videography"
  | "flowers"
  | "music"
  | "decoration"
  | "venue"
  | "makeup"
  | "fashion"
  | "transportation"
  | "other";

export type BookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
}

export interface PlannerProfile {
  id: string;
  user_id: string;
  business_name: string;
  bio: string | null;
  location: string | null;
  specialties: string[];
  avg_rating: number;
  review_count: number;
  verified: boolean;
}

export interface VendorProfile {
  id: string;
  user_id: string;
  business_name: string;
  category: VendorCategory;
  location: string | null;
  avg_rating: number;
  verified: boolean;
}

export interface Event {
  id: string;
  client_id: string;
  planner_id: string | null;
  title: string;
  event_type: EventType;
  event_date: string | null;
  venue: string | null;
  budget: number | null;
  status: EventStatus;
  style_preferences: Record<string, unknown> | null;
  ai_recommendations: Record<string, unknown> | null;
}

export interface Message {
  id: string;
  event_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface Review {
  id: string;
  author_id: string;
  planner_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}
