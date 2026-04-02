import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Providers } from "./providers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { ProductTour } from "@/components/ProductTour";
import { WhatsNew } from "@/components/WhatsNew";

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
    <Providers>
      <div id="app-layout-debug" style={{ display: 'none' }} data-session={!!session} data-user={!!dbUser} />
      {dbUser && (
        <>
          <ProductTour 
            completedTours={dbUser.completedTours} 
          />
          <WhatsNew completedTours={dbUser.completedTours} />
        </>
      )}
      <div className="grid min-h-screen gap-8 p-6 lg:grid-cols-[260px_1fr]">
        <Sidebar session={session} />
        <div className="flex flex-col gap-8">
          <Topbar session={session} />
          <main className="fade-up p-2 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}
