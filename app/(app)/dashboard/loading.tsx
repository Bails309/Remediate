export default function LoadingDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-48 rounded-full bg-[color:var(--color-muted)]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-[26px] bg-[color:var(--color-muted)]" />
        ))}
      </div>
    </div>
  );
}
