"use client";

import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

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
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            classNames: {
              toast:
                "border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
              success:
                "bg-green-50 text-green-800 border-green-200 dark:bg-slate-800 dark:border-green-500/30 dark:text-green-400 border shadow-lg",
              error:
                "dark:border-rose-500/40 dark:bg-slate-800",
              description: "text-slate-600 dark:text-slate-300",
            },
          }}
        />
      </ThemeProvider>
    </NextAuthProvider>
  );
}
