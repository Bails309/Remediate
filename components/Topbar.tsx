import { ThemeToggle } from "@/components/ThemeToggle";

export function Topbar() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-accent-2)]">Nessus</p>
        <h1 className="text-3xl font-semibold">Security Remediation Command</h1>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
      </div>
    </header>
  );
}
