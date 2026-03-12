"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

export interface ArrangementItem {
  id: string;
  image_url: string;
  caption?: string;
  event_type?: string;
  style_tags: string[];
  planner_id?: string;
}

interface ArrangementCardProps {
  item: ArrangementItem;
}

export function ArrangementCard({ item }: ArrangementCardProps) {
  return (
    <Link href={item.planner_id ? `/planners/${item.planner_id}` : "/planners"}>
      <motion.article
        className="group relative overflow-hidden rounded-xl aspect-[4/5] bg-muted"
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Image
          src={item.image_url}
          alt={item.caption ?? "Arrangement"}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          placeholder="blur"
          blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWEREiMxUf/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6b+h/ABJXNN9n/9k="
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <div className="flex flex-wrap gap-2 mb-2">
            {item.event_type && (
              <Badge className="bg-rose-600/90 hover:bg-rose-600/90 text-white border-0">
                {item.event_type}
              </Badge>
            )}
            {item.style_tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="bg-white/20 text-white border-0 backdrop-blur-sm"
              >
                {tag}
              </Badge>
            ))}
          </div>
          {item.caption && (
            <p className="text-sm text-white/90 line-clamp-2">{item.caption}</p>
          )}
        </div>
      </motion.article>
    </Link>
  );
}
