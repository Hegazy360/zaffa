import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

const openai = new OpenAI();

const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? "openai.text-embedding-3-small";

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

export async function getRecommendations(
  supabase: SupabaseClient,
  eventId: string,
  type: "planner" | "vendor"
) {
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (!event) throw new Error("Event not found");

  const description = `${event.event_type} event, budget ${event.budget ?? "flexible"}, style: ${JSON.stringify(event.style_preferences ?? {})}, venue: ${event.venue ?? "tbd"}`;
  const embedding = await getEmbedding(description);

  const table = type === "planner" ? "planner_profiles" : "vendor_profiles";

  const { data, error } = await supabase.rpc("match_profiles", {
    query_embedding: embedding,
    match_table: table,
    match_count: 10,
  });

  if (error) throw error;
  return data ?? [];
}
