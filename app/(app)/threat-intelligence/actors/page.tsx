import type { Metadata } from "next";
import { PremiumBackground } from "@/components/PremiumBackground";
import { ThreatActorsClient } from "./actors-client";
import { Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Threat Actors",
};

export const dynamic = "force-dynamic";

export default function ThreatActorsPage() {
  return (
    <>
      <PremiumBackground imageUrl="/images/intelligence-bg.png" />
      <div className="relative -m-6 p-6 min-h-screen z-10 space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="text-blue-400 h-8 w-8" />
            Threat Actors
          </h1>
          <div className="text-sm opacity-60">
            <p>Adversary groups tracked by MITRE ATT&amp;CK, refreshed weekly.</p>
          </div>
        </div>

        <ThreatActorsClient />
      </div>
    </>
  );
}
