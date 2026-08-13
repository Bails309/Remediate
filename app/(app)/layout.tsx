import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Providers } from "./providers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { ProductTour } from "@/components/ProductTour";
import { WhatsNew } from "@/components/WhatsNew";
import { IdleTimeout } from "@/components/IdleTimeout";
import { CursorSpotlight } from "@/components/CursorSpotlight";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  console.error("[AppLayout] Rendering..."); // Added this line based on the instruction to add log to AppLayout
  const session = await auth();
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  console.error("[AppLayout] Session:", !!session, "Nonce:", !!nonce);

  const dbUser = session?.user?.email 
    ? await prisma.user.findUnique({ 
        where: { email: session.user.email.toLowerCase() },
        select: { isNewUser: true, completedTours: true, email: true }
      })
    : null;

  console.error("[AppLayout] DB User:", !!dbUser, "Email used:", session?.user?.email?.toLowerCase());

  return (
    <Providers nonce={nonce}>
      <div id="app-layout-debug" style={{ display: 'none' }} data-session={!!session} data-user={!!dbUser} />
      <IdleTimeout />
      <CursorSpotlight />
      {dbUser && !process.env.E2E_TESTING && (
        <>
          <ProductTour 
            completedTours={dbUser.completedTours} 
          />
          <WhatsNew completedTours={dbUser.completedTours} />
        </>
      )}
      <div className="grid min-h-screen lg:grid-cols-[88px_1fr]">
        <Sidebar session={session} />
        <div className="flex min-w-0 flex-col gap-8 p-6">
          <Topbar session={session} />
          <main className="fade-up p-2 lg:p-6">
            {children}
          </main>
          <footer className="mt-auto border-t border-white/5 px-2 py-4 lg:px-6 flex items-center gap-4 text-xs opacity-40">
            <Link href="/privacy" className="hover:opacity-100 transition-opacity">Privacy Policy</Link>
            <span>·</span>
            <Link href="/accessibility" className="hover:opacity-100 transition-opacity">Accessibility</Link>
          </footer>
        </div>
      </div>
    </Providers>
  );
}
