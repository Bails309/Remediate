import { prisma } from "../lib/prisma";
import { syncAllThreats } from "../lib/threat-intelligence/worker";
import { dispatchDailyDigests } from "../lib/threat-intelligence/dispatcher";

// Mocking these for logic verification
async function simulateScheduler(mockDate: Date, lastThreatDigestAt: Date | null) {
    const now = mockDate;
    const currentDayStr = now.toISOString().split('T')[0];
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    console.log(`[Sim] Current Time: ${now.toISOString()}, Last Digest: ${lastThreatDigestAt?.toISOString() || 'Never'}`);

    const lastSyncDay = lastThreatDigestAt ? lastThreatDigestAt.toISOString().split('T')[0] : null;

    let syncTriggered = false;
    let dispatchTriggered = false;

    // 1. Daily Full Sync at 7:30 AM UTC or later
    if (hour >= 7 && (lastSyncDay !== currentDayStr)) {
        if (hour > 7 || (hour === 7 && minute >= 30)) {
            console.log(`[Sim] Sync window reached!`);
            syncTriggered = true;
        }
    }

    // 2. Daily Dispatch at 8:00 AM UTC or later
    if (hour >= 8 && (lastSyncDay !== currentDayStr)) {
        console.log(`[Sim] Dispatch window reached!`);
        dispatchTriggered = true;
    }

    return { syncTriggered, dispatchTriggered };
}

async function runTests() {
    console.log("Test 1: 7:29 AM, No previous digest today -> Should NOT sync, NOT dispatch");
    const t1 = await simulateScheduler(new Date("2026-03-15T07:29:00Z"), new Date("2026-03-14T08:05:00Z"));
    console.assert(!t1.syncTriggered, "T1 Sync triggered early");
    console.assert(!t1.dispatchTriggered, "T1 Dispatch triggered early");

    console.log("Test 2: 7:31 AM, No previous digest today -> Should sync, NOT dispatch");
    const t2 = await simulateScheduler(new Date("2026-03-15T07:31:00Z"), new Date("2026-03-14T08:05:00Z"));
    console.assert(t2.syncTriggered, "T2 Sync didn't trigger");
    console.assert(!t2.dispatchTriggered, "T2 Dispatch triggered early");

    console.log("Test 3: 8:05 AM, No previous digest today -> Should sync AND dispatch");
    const t3 = await simulateScheduler(new Date("2026-03-15T08:05:00Z"), new Date("2026-03-14T08:05:00Z"));
    console.assert(t3.syncTriggered, "T3 Sync didn't trigger");
    console.assert(t3.dispatchTriggered, "T3 Dispatch didn't trigger");

    console.log("Test 4: 8:10 AM, Already dispatched today -> Should NOT sync, NOT dispatch");
    const t4 = await simulateScheduler(new Date("2026-03-15T08:10:00Z"), new Date("2026-03-15T08:05:00Z"));
    console.assert(!t4.syncTriggered, "T4 Sync repeated");
    console.assert(!t4.dispatchTriggered, "T4 Dispatch repeated");

    console.log("Test 5: 9:00 AM after worker restart, Nothing today -> Should sync AND dispatch (Missed window recovery)");
    const t5 = await simulateScheduler(new Date("2026-03-15T09:00:00Z"), new Date("2026-03-14T08:05:00Z"));
    console.assert(t5.syncTriggered, "T5 Sync didn't recover");
    console.assert(t5.dispatchTriggered, "T5 Dispatch didn't recover");

    console.log("\nAll logic tests passed!");
}

runTests().catch(console.error);
