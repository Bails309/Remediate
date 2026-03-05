import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen gap-8 p-6 lg:grid-cols-[260px_1fr]">
      <Sidebar />
      <div className="flex flex-col gap-8">
        <Topbar />
        <main className="glass grid-texture fade-up rounded-[32px] p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
