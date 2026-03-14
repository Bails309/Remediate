import { auth } from "@/auth";
import { ThreatFeed } from "@/components/ThreatFeed";
import { ThreatSubscriptionUI } from "@/components/ThreatSubscriptionUI";
import { ShieldCheck, Info } from "lucide-react";
import { PremiumBackground } from "@/components/PremiumBackground";

export default async function ThreatIntelligencePage() {
  const session = await auth();
  const userId = session?.user?.id;

  return (
    <>
      <PremiumBackground imageUrl="/images/intelligence-bg.png" />
      <div className="relative -m-6 p-6 min-h-screen z-10 space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <ShieldCheck className="text-blue-400 h-8 w-8" />
            Threat Intelligence Centre
          </h1>
          <div className="text-sm opacity-60">
            <p>Real-time global vulnerability synchronization from NVD, OSV.dev, and CISA KEV.</p>
            <p className="mt-1">Synchronized hourly with a full daily delta at 7:30 AM UTC.</p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
          <div className="h-[800px]">
            <ThreatFeed />
          </div>
          
          <div className="space-y-6">
            <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                <Info className="text-blue-400 h-5 w-5" />
                Source Context
              </h3>
              <div className="space-y-4 text-sm opacity-70 leading-relaxed text-[color:var(--color-foreground)]">
                <p>
                  <b className="text-[color:var(--color-foreground)] dark:text-white">NVD (NIST)</b>: Primary source for CVE metadata and formal severity scoring.
                </p>
                <p>
                  <b className="text-[color:var(--color-foreground)] dark:text-white">OSV.dev</b>: Ecosystem-specific intelligence for open-source library vulnerabilities.
                </p>
                <p>
                  <b className="text-[color:var(--color-foreground)] dark:text-white">CISA KEV</b>: Known Exploited Vulnerabilities - priority items being weaponized in the wild.
                </p>
              </div>
            </div>
            
            {userId && (
              <div className="sticky top-6">
                <ThreatSubscriptionUI userId={userId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
