import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppToaster } from "@/components/AppToaster";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Remediate",
    template: "%s | Remediate",
  },
  description: "Advanced automated vulnerability remediation triage and lifecycle management.",
  keywords: ["Vulnerability Management", "Triage", "Security Operations", "Remediation", "Security"],
  authors: [{ name: "Remediate Team" }],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sora.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
