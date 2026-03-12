export default function PlannersLoading() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-4" />
        <div className="h-10 w-full max-w-md bg-muted animate-pulse rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  );
}
