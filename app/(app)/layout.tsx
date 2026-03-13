import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Providers } from "./providers";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <Providers>
      <div className="grid min-h-screen gap-8 p-6 lg:grid-cols-[260px_1fr]">
        <Sidebar session={session} />
        <div className="flex flex-col gap-8">
          <Topbar />
          <main className="fade-up p-2 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}
