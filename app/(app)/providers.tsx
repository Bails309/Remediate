"use client";

import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";

const NextAuthProvider = dynamic(() => import("./next-auth-provider"), {
  ssr: false,
});

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextAuthProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        {children}
      </ThemeProvider>
    </NextAuthProvider>
  );
}
