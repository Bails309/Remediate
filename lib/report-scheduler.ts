import { prisma } from "@/lib/prisma";
import { getReportConfig } from "@/lib/reports";
import { getWeeklyCriticalHighSummary } from "@/lib/report-analytics";
import { sendReportEmail, renderEmailLayout } from "@/lib/email";

const CHECK_INTERVAL_MS = 60 * 1000;

function getNextScheduledDate(config: { dayOfWeek: number; hour: number; minute: number; timezone: string }) {
  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);

  const currentDay = target.getUTCDay();
  const daysAhead = (config.dayOfWeek - currentDay + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysAhead);
  target.setUTCHours(config.hour, config.minute, 0, 0);

  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 7);
  }

  return target;
}

export function startReportScheduler() {
  setInterval(async () => {
    try {
      const config = await getReportConfig(true);
      if (!config || !config.enabled) {
        return;
      }

      const lastSentAt = config.lastSentAt ? new Date(config.lastSentAt) : null;
      const next = getNextScheduledDate(config);
      const now = new Date();

      if (lastSentAt && lastSentAt >= next) {
        return;
      }

      if (now < next) {
        return;
      }

      const { summary, totals } = await getWeeklyCriticalHighSummary();
      const subject = `Weekly Critical/High Report (${totals.critical} critical, ${totals.high} high)`;
      const lines = summary
        .map((item: { siteName: string; risk: string; count: number }) => `${item.siteName}: ${item.risk}=${item.count}`)
        .join("\n");
      const text = `Weekly Critical/High Report\n\nTotal Critical: ${totals.critical}\nTotal High: ${totals.high}\n\nBy Bucket:\n${lines}`;

      const html = renderEmailLayout({
        title: "Weekly Security Summary",
        preheader: `You have ${totals.critical} critical and ${totals.high} high risk findings this week.`,
        contentHtml: `
          <h1 style="color: #0f172a; font-size: 26px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.025em; line-height: 1.2;">Weekly Summary</h1>
          <p style="color: #64748b; font-size: 15px; margin: 0 0 32px 0;">Here is your security posture overview for the past week.</p>
          
          <!-- Bento Grid Totals -->
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
              ${summary.map((item: { siteName: string; risk: string; count: number }, index: number) => `
                <tr>
                  <td style="padding: 16px 20px; border-bottom: ${index === summary.length - 1 ? 'none' : '1px solid #f1f5f9'};">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-weight: 600; color: #334155;">${item.siteName}</td>
                        <td align="right" style="font-family: monospace; color: #64748b; font-size: 13px;">
                          <span style="color: ${item.risk === 'Critical' ? '#ef4444' : '#f97316'}; font-weight: 700;">${item.count}</span> ${item.risk}
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
    } catch {
      // Ignore missing table or transient startup errors.
      return;
    }
  }, CHECK_INTERVAL_MS);
}
