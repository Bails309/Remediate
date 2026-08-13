"use client";

import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";

const NextAuthProvider = dynamic(() => import("./next-auth-provider"), {
  ssr: false,
});

export function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <NextAuthProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
        {children}
      </ThemeProvider>
    </NextAuthProvider>
  );
}
