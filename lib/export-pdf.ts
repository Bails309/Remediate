import PDFDocument from "pdfkit";
import { VulnerabilityExportItem } from "@/lib/export-csv";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#b91c1c", // red-700
  High: "#c2410c",     // orange-700
  Medium: "#b45309",   // amber-700
  Low: "#2563eb",      // blue-600
  None: "#64748b",     // slate-500
};

export function generateVulnerabilitiesPdf(
  items: VulnerabilityExportItem[],
  metadata?: {
    bucketName?: string;
    filters?: Record<string, unknown>;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 80;

      // Header
      doc.rect(40, 40, contentWidth, 54).fill("#0f172a");

      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16);
      doc.text("REMEDIATE — VULNERABILITY REPORT", 54, 52);

      doc.fillColor("#94a3b8").font("Helvetica").fontSize(9);
      const subtitle = metadata?.bucketName
        ? `Bucket: ${metadata.bucketName} | Generated: ${new Date().toISOString().split("T")[0]}`
        : `All Buckets | Generated: ${new Date().toISOString().split("T")[0]}`;
      doc.text(subtitle, 54, 72);

      doc.y = 110;

      // Executive Summary Metrics Box
      const counts = { Critical: 0, High: 0, Medium: 0, Low: 0, None: 0 };
      for (const item of items) {
        const r = item.risk in counts ? (item.risk as keyof typeof counts) : "None";
        counts[r]++;
      }

      doc.rect(40, doc.y, contentWidth, 50).fillAndStroke("#f8fafc", "#e2e8f0");
      const summaryY = doc.y + 10;

      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10);
      doc.text(`Total Findings: ${items.length}`, 54, summaryY);

      doc.font("Helvetica").fontSize(9);
      const metricsText = [
        `Critical: ${counts.Critical}`,
        `High: ${counts.High}`,
        `Medium: ${counts.Medium}`,
        `Low: ${counts.Low}`,
        `Info: ${counts.None}`,
      ].join("   |   ");
      doc.fillColor("#475569").text(metricsText, 54, summaryY + 16);

      doc.y = summaryY + 45;

      // Table of Findings
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12);
      doc.text("Outstanding Findings", 40, doc.y);
      doc.y += 15;

      if (items.length === 0) {
        doc.font("Helvetica-Oblique").fontSize(10).fillColor("#64748b");
        doc.text("No outstanding vulnerabilities found for the selected criteria.", 40, doc.y);
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Ensure enough space on the page for this finding (approx 90-120pt)
        if (doc.y > 660) {
          doc.addPage();
        }

        const startY = doc.y;
        const color = SEVERITY_COLORS[item.risk] || "#64748b";

        // Draw finding container line/box
        doc.rect(40, startY, 4, 18).fill(color);

        // Title and Severity
        doc.fillColor(color).font("Helvetica-Bold").fontSize(10);
        doc.text(`[${item.risk.toUpperCase()}]`, 48, startY + 2, { continued: true });
        doc.fillColor("#0f172a").text(`  ${item.name}`, { width: contentWidth - 12 });

        doc.font("Helvetica").fontSize(8).fillColor("#475569");
        const detailsLine = [
          `Report: ${item.site?.name ?? "N/A"}`,
          `Host: ${item.host}`,
          `Service / Port: ${item.port}${item.protocol ? ` (${item.protocol})` : ""}`,
          item.cve ? `CVE: ${item.cve}` : null,
          item.cvssScore ? `CVSS: ${item.cvssScore}` : null,
          item.status ? `Status: ${item.status}` : null,
          item.assignee?.name ? `Assignee: ${item.assignee.name}` : null,
        ]
          .filter(Boolean)
          .join("   |   ");

        doc.text(detailsLine, 48, doc.y + 4, { width: contentWidth - 8 });

        const briefDesc = item.synopsis || (item.description ? item.description.slice(0, 250) : null);
        if (briefDesc) {
          doc.fillColor("#334155").font("Helvetica-Oblique").fontSize(8);
          doc.text(`Brief Description: ${briefDesc.slice(0, 250)}`, 48, doc.y + 4, { width: contentWidth - 8 });
        }

        if (item.solution) {
          doc.fillColor("#1e293b").font("Helvetica").fontSize(8);
          doc.text(`Remediation: ${item.solution.slice(0, 300)}`, 48, doc.y + 4, { width: contentWidth - 8 });
        }

        // Bottom separator
        doc.y += 10;
        doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(40, doc.y).lineTo(pageWidth - 40, doc.y).stroke();
        doc.y += 10;
      }

      // Add page numbers and footer across all buffered pages
      const pages = doc.bufferedPageRange();
      const totalPages = pages.count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        // Temporarily reset bottom margin so footer text placed below normal margins
        // does not trigger PDFKit automatic page breaks (which previously created trailing empty pages)
        doc.page.margins.bottom = 0;

        const footerLineY = doc.page.height - 35;
        const footerTextY = doc.page.height - 25;

        doc.strokeColor("#cbd5e1").lineWidth(0.5).moveTo(40, footerLineY).lineTo(pageWidth - 40, footerLineY).stroke();

        doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
        doc.text("Remediate Vulnerability Management — Confidential", 40, footerTextY, { lineBreak: false });
        doc.text(
          `Page ${i + 1} of ${totalPages}`,
          pageWidth - 140,
          footerTextY,
          { width: 100, align: "right", lineBreak: false }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
