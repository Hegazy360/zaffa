export default function ExploreLoading() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-4" />
        <div className="h-10 w-full bg-muted animate-pulse rounded" />
      </div>
      <div className="columns-1 md:columns-2 lg:columns-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="break-inside-avoid mb-4 bg-muted animate-pulse rounded-xl"
            style={{ height: `${200 + Math.random() * 200}px` }}
          />
        ))}
      </div>
    </div>
  );
}
