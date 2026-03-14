import { renderThreatEmail, ThreatGroup } from "../lib/threat-intelligence/email-template";

// Minimal verification script used only for build-time type checks.
// Generates a simple email HTML output from an empty threat set.

const sampleThreats: ThreatGroup = {
  cisaKev: [],
  criticalHigh: [],
  standard: []
};

export function verifyRender() {
  return renderThreatEmail(sampleThreats);
}

if (require.main === module) {
  // When run directly, print a short preview to stdout.
  const output = verifyRender();
  console.log(output.slice(0, 100));
}
