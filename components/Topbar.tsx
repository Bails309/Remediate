import { ThemeToggle } from "@/components/ThemeToggle";

export function Topbar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-accent-2)]">Nessus</p>
        <h1 className="text-2xl font-semibold">Security Remediation Command</h1>
      </div>
      <ThemeToggle />
    </div>
  );
}
