"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export interface PortfolioItem {
  id: string;
  image_url: string;
  caption?: string;
  event_type?: string;
  style_tags: string[];
}

interface PortfolioGalleryProps {
  items: PortfolioItem[];
}

export function PortfolioGallery({ items }: PortfolioGalleryProps) {
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => (
            <motion.button
              key={item.id}
              className="relative aspect-square overflow-hidden rounded-xl bg-muted group focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              onClick={() => setSelectedItem(item)}
            >
              <Image
                src={item.image_url}
                alt={item.caption ?? "Portfolio image"}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                <div className="flex flex-wrap gap-1.5">
                  {item.event_type && (
                    <Badge className="bg-rose-600/90 text-white border-0 text-xs">
                      {item.event_type}
                    </Badge>
                  )}
                  {item.style_tags.slice(0, 2).map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-white/20 text-white border-0 text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                {item.caption && (
                  <p className="text-xs text-white/90 line-clamp-2 mt-1">
                    {item.caption}
                  </p>
                )}
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      >
        <DialogContent
          className="max-w-4xl p-0 overflow-hidden"
          showCloseButton={true}
        >
          {selectedItem && (
            <div className="relative">
              <div className="aspect-video md:aspect-[16/10] relative bg-muted">
                <Image
                  src={selectedItem.image_url}
                  alt={selectedItem.caption ?? "Portfolio image"}
                  fill
                  sizes="(max-width: 896px) 100vw, 896px"
                  className="object-contain"
                />
              </div>
              <div className="p-4 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {selectedItem.event_type && (
                    <Badge className="bg-rose-600/90 text-white border-0">
                      {selectedItem.event_type}
                    </Badge>
                  )}
                  {selectedItem.style_tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                {selectedItem.caption && (
                  <p className="text-sm text-muted-foreground">
                    {selectedItem.caption}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
