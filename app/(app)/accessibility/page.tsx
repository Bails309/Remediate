import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility Statement | Remediate",
};

export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-10 px-4">
      <h1 className="text-3xl font-bold tracking-tight">Accessibility Statement</h1>
      <p className="opacity-80 leading-relaxed">
        Remediate is committed to ensuring digital accessibility for people of all
        abilities. We continually work to improve the user experience for everyone
        and apply the relevant accessibility standards.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Conformance Target</h2>
        <p className="opacity-80 leading-relaxed">
          We aim to conform to the <strong>Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</strong>.
          These guidelines explain how to make web content more accessible to people with
          disabilities and more user-friendly for everyone.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Measures Taken</h2>
        <ul className="list-disc pl-6 space-y-1 opacity-80">
          <li>Semantic HTML elements and ARIA landmarks throughout the interface</li>
          <li>Keyboard-navigable menus, dialogs, and interactive controls</li>
          <li>Sufficient colour contrast ratios across light and dark themes</li>
          <li>Responsive design supporting zoom up to 200% without loss of content</li>
          <li>Form inputs with visible labels and descriptive error messages</li>
          <li>Skip-to-content link for screen reader users</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Known Limitations</h2>
        <ul className="list-disc pl-6 space-y-1 opacity-80">
          <li>Some complex data tables and charts may not fully convey information to screen readers</li>
          <li>Third-party embedded content (e.g. threat intelligence feeds) may not meet all WCAG criteria</li>
          <li>PDF report exports may have limited accessibility tagging</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Feedback</h2>
        <p className="opacity-80 leading-relaxed">
          We welcome your feedback on the accessibility of Remediate. If you encounter
          accessibility barriers or have suggestions for improvement, please use the
          in-app <strong>Feedback</strong> button in the sidebar, or contact your
          organisation&rsquo;s Remediate administrator.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Compatibility</h2>
        <p className="opacity-80 leading-relaxed">
          Remediate is designed to be compatible with current versions of major browsers
          (Chrome, Edge, Firefox, Safari) and assistive technologies including NVDA, JAWS,
          and VoiceOver.
        </p>
      </section>

      <p className="text-xs opacity-40 pt-4">Last updated: July 2025</p>
    </div>
  );
}
