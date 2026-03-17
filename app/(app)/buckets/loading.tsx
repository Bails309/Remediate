export default function LoadingSites() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-36 rounded-full bg-[color:var(--color-muted)]" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-24 rounded-[24px] bg-[color:var(--color-muted)]" />
        ))}
      </div>
    </div>
  );
}
