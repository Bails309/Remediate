import { prisma } from "@/lib/prisma";
import { getReportConfig } from "@/lib/reports";
import { getWeeklyCriticalHighSummary } from "@/lib/report-analytics";
import { sendReportEmail } from "@/lib/email";

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
      const config = await getReportConfig();
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
      .map((item) => `${item.siteName}: ${item.risk}=${item.count}`)
      .join("\n");
    const text = `Weekly Critical/High Report\n\nTotal Critical: ${totals.critical}\nTotal High: ${totals.high}\n\nBy Site:\n${lines}`;
    const html = `
      <h2>Weekly Critical/High Report</h2>
      <p><strong>Total Critical:</strong> ${totals.critical}</p>
      <p><strong>Total High:</strong> ${totals.high}</p>
      <h3>By Site</h3>
      <ul>
        ${summary.map((item) => `<li>${item.siteName}: ${item.risk} = ${item.count}</li>`).join("")}
      </ul>
    `;

    await sendReportEmail(config, subject, html, text);

      const existing = await prisma.reportConfig.findFirst();
      if (existing) {
        await prisma.reportConfig.update({
          where: { id: existing.id },
          data: { lastSentAt: now },
        });
      }
    } catch (error) {
      // Ignore missing table or transient startup errors.
      return;
    }
  }, CHECK_INTERVAL_MS);
}
