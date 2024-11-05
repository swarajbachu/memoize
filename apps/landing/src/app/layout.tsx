import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@memoize/ui/globals";
import Script from "next/script";
import NavBar from "~/components/navbar";

export const runtime = "edge";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Memoize - Your Mini Therapist",
  description:
    "A platform to help you journal, self-reflect, and understand yourself better.",
  twitter: {
    card: "summary_large_image",
    site: "@swarajbahcu",
    title: "Memoize - Your Mini Therapist",
    description:
      "Join Memoize to start your journey of self-discovery through journaling and self-reflection.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-T2TD6S991W"
      />
      <Script id="google-analytics">
        {`
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-T2TD6S991W');
`}
      </Script>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-card`}
      >
        <NavBar />
        {children}
      </body>
    </html>
  );
}
