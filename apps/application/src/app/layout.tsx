import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { cn } from "@memoize/ui";
import { ThemeProvider, ThemeToggle } from "@memoize/ui/theme";

import { TRPCReactProvider } from "~/trpc/react";

import "~/app/globals.css";

import { env } from "~/env";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://app.memoize.co"
      : "http://localhost:3000",
  ),
  title: "Memoize - Your Personal Journaling Platform",
  description:
    "Capture your thoughts, memories, and ideas with Memoize, the intelligent journaling platform.",
  openGraph: {
    title: "Memoize - Your Personal Journaling Platform",
    description:
      "Capture your thoughts, memories, and ideas with Memoize, the intelligent journaling platform.",
    url: "https://app.memoize.co",
    siteName: "Memoize",
  },
  twitter: {
    card: "summary_large_image",
    site: "@swarajbachu",
    creator: "@swarajbachu",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#000000" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body
        className={cn(
          "min-h-screen bg-background font-sans text-foreground antialiased",
          GeistSans.variable,
          GeistMono.variable,
        )}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Toaster />
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
