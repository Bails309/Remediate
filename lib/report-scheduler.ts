import { prisma } from "@/lib/prisma";
import { getReportConfig } from "@/lib/reports";
import { getWeeklyCriticalHighSummary } from "@/lib/report-analytics";
import { sendReportEmail, renderEmailLayout } from "@/lib/email";
import { syncAllThreats } from "./threat-intelligence/worker";
import { dispatchDailyDigests } from "./threat-intelligence/dispatcher";

const CHECK_INTERVAL_MS = 60 * 1000;

import { toDate } from "date-fns-tz";

function isTimeToSend(config: { dayOfWeek: number; hour: number; minute: number; timezone: string }, lastSentAt: Date | null) {
  const now = new Date();

  // Determine "Today" in the configured timezone
  const nowStr = new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [mm, dd, yyyy] = nowStr.split('/');

  // Calculate the target scheduled time for the *current* local week
  const localTargetDateStr = `${yyyy}-${mm}-${dd}T${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')}:00`;

  // Parse this target as a proper timezone-aware Date Object
  const target = toDate(localTargetDateStr, { timeZone: config.timezone });

  // Adjust the day of the week forward
  const targetDay = target.getDay();
  const daysAhead = (config.dayOfWeek - targetDay + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysAhead);

  if (now < target) {
    return false;
  }

  if (lastSentAt && lastSentAt >= target) {
    return false;
  }

  return true;
}

export function startReportScheduler() {
  // Trigger an immediate sync on startup to populate the feed
  console.log("[Scheduler] Triggering immediate startup threat sync...");
  syncAllThreats().catch(err => console.error("Startup threat sync failed:", err));

  setInterval(async () => {
    try {
      const config = await getReportConfig(true);
      if (!config || !config.enabled) {
        return;
      }

      const lastSentAt = config.lastSentAt ? new Date(config.lastSentAt) : null;
      if (!isTimeToSend(config, lastSentAt)) {
        // Fall through to other daily tasks even if the weekly report isn't ready
      } else {
        await sendWeeklyReport(config);
      }

      await handleDailyThreatIntelligence();
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  }, CHECK_INTERVAL_MS);
}

async function sendWeeklyReport(config: any) {
    const now = new Date();
    const { summary, totals } = await getWeeklyCriticalHighSummary();

    const grouped = summary.reduce((acc: Record<string, { critical: number; high: number }>, item: { siteName: string; risk: string; count: number }) => {
      if (!acc[item.siteName]) {
        acc[item.siteName] = { critical: 0, high: 0 };
      }
      if (item.risk === "Critical") acc[item.siteName].critical = item.count;
      if (item.risk === "High") acc[item.siteName].high = item.count;
      return acc;
    }, {});

    const subject = `Weekly Critical / High Report (${totals.critical} critical, ${totals.high} high)`;
    const text = `Weekly Critical / High Report\n\nTotal Critical: ${totals.critical}\nTotal High: ${totals.high}\n\nBreakdown by Bucket:\n${Object.entries(grouped)
      .map(([name, counts]: [string, any]) => `${name}: ${(counts as any).critical} Critical, ${(counts as any).high} High`)
      .join("\n")}`;

    const html = renderEmailLayout({
      title: "Weekly Security Summary",
      preheader: `You have ${totals.critical} critical and ${totals.high} high risk findings this week.`,
      contentHtml: `
  <h1 style="color: #0f172a; font-size: 26px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.025em; line-height: 1.2;">Weekly Summary</h1>
  <p style="color: #64748b; font-size: 15px; margin: 0 0 32px 0;">Here is your security posture overview for the past week.</p>

  <!--Bento Grid Totals-->
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
    <tr>
      <td width="50%" style="padding-right: 10px;">
        <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 16px; padding: 24px; text-align: center;">
          <div style="font-size: 11px; font-weight: 800; color: #991b1b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Critical</div>
          <div style="font-size: 32px; font-weight: 800; color: #ef4444;">${totals.critical}</div>
        </div>
      </td>
      <td width="50%" style="padding-left: 10px;">
        <div style="background-color: #fffaf0; border: 1px solid #ffedd5; border-radius: 16px; padding: 24px; text-align: center;">
          <div style="font-size: 11px; font-weight: 800; color: #9a3412; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">High Risk</div>
          <div style="font-size: 32px; font-weight: 800; color: #f97316;">${totals.high}</div>
        </div>
      </td>
    </tr>
  </table>

  <h2 style="color: #1e293b; font-size: 18px; font-weight: 700; margin: 0 0 16px 0;">Breakdown by Bucket</h2>
  <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
      ${Object.entries(grouped).map(([siteName, counts]: [string, any], index, arr) => `
        <tr>
          <td style="padding: 16px 20px; border-bottom: ${index === arr.length - 1 ? 'none' : '1px solid #f1f5f9'};">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="font-weight: 600; color: #334155;">${siteName}</td>
                <td align="right">
                  ${(counts as { critical: number }).critical > 0 ? `
                    <span style="display: inline-block; background-color: #fef2f2; color: #ef4444; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 99px; margin-left: 8px;">
                      ${(counts as { critical: number }).critical} Critical
                    </span>
                  ` : ""}
                  ${(counts as { high: number }).high > 0 ? `
                    <span style="display: inline-block; background-color: #fffaf0; color: #f97316; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 99px; margin-left: 8px;">
                      ${(counts as { high: number }).high} High
                    </span>
                  ` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `).join("")}
    </table>
  </div>
      `
    });

    await sendReportEmail(config, subject, html, text);

    const existing = await prisma.reportConfig.findFirst();
    if (existing) {
      await prisma.reportConfig.update({
        where: { id: existing.id },
        data: { lastSentAt: now },
      });
    }
}

async function handleDailyThreatIntelligence() {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    // 1. Daily Full Sync at 7:30 AM UTC (48-hour window for safety)
    if (hour === 7 && minute === 30) {
        await syncAllThreats(48);
    }

    // 2. Daily Dispatch at 8:00 AM UTC
    if (hour === 8 && minute === 0) {
        await dispatchDailyDigests();
    }

    // 3. Hourly Delta Sync at :45 of every hour (3-hour window to cover gaps)
    if (minute === 45) {
        await syncAllThreats(3);
    }
}
