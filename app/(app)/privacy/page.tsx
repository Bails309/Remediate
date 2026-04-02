import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Remediate",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-10 px-4">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="opacity-80 leading-relaxed">
        This policy explains how Remediate collects, uses, and protects personal
        data in accordance with the UK General Data Protection Regulation (UK GDPR)
        and the Data Protection Act 2018.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data We Collect</h2>
        <ul className="list-disc pl-6 space-y-1 opacity-80">
          <li><strong>Identity data</strong> — name, email address, and organisational role provided by your identity provider (Microsoft Entra ID / OIDC)</li>
          <li><strong>Usage data</strong> — actions performed within the application (e.g. vulnerability assignments, status changes, comments) recorded in audit logs</li>
          <li><strong>Technical data</strong> — IP address, browser type, and session metadata used for security monitoring</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Legal Basis for Processing</h2>
        <p className="opacity-80 leading-relaxed">
          We process personal data under <strong>legitimate interest</strong> (vulnerability
          management and organisational security) and <strong>contractual necessity</strong>
          (providing the service your organisation has deployed).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data Retention</h2>
        <ul className="list-disc pl-6 space-y-1 opacity-80">
          <li>User accounts — retained while the account is active; deleted upon request or deprovisioning</li>
          <li>Audit logs — retained for 12 months, then automatically purged</li>
          <li>Vulnerability data — retained as long as it is relevant to your organisation&rsquo;s security posture</li>
          <li>Session data — automatically expires after 8 hours of inactivity</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your Rights</h2>
        <p className="opacity-80 leading-relaxed">
          Under UK GDPR you have the right to:
        </p>
        <ul className="list-disc pl-6 space-y-1 opacity-80">
          <li><strong>Access</strong> — export your data via the <em>Subject Access Request</em> endpoint (<code className="text-xs bg-white/10 px-1 py-0.5 rounded">GET /api/account</code>)</li>
          <li><strong>Erasure</strong> — request deletion of your account and associated data (<code className="text-xs bg-white/10 px-1 py-0.5 rounded">DELETE /api/account</code>)</li>
          <li><strong>Rectification</strong> — contact your administrator to correct inaccurate personal data</li>
          <li><strong>Object</strong> — raise concerns about processing with your organisation&rsquo;s Data Protection Officer</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data Sharing</h2>
        <p className="opacity-80 leading-relaxed">
          Remediate does not share personal data with third parties. All data is
          processed within your organisation&rsquo;s own infrastructure. External threat
          intelligence feeds are queried anonymously and do not transmit personal data.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cookies &amp; Sessions</h2>
        <p className="opacity-80 leading-relaxed">
          Remediate uses essential cookies only: a session cookie for authentication
          and a CSRF nonce cookie for security. No analytics or advertising cookies
          are used.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="opacity-80 leading-relaxed">
          For privacy-related queries, contact your organisation&rsquo;s Remediate
          administrator or Data Protection Officer.
        </p>
      </section>

      <p className="text-xs opacity-40 pt-4">Last updated: July 2025</p>
    </div>
  );
}
