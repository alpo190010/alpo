import type { Metadata } from "next";
import "./globals.css";
import { PHProvider } from "./providers";

export const metadata: Metadata = {
  title: "PageScore — AI Landing Page Analyzer | Free Score in 30 Seconds",
  description:
    "Paste any URL. Get an AI-powered landing page score (0-100) with 3 actionable fixes in 30 seconds. Free. No signup. Used by 100+ founders.",
  openGraph: {
    title: "PageScore — Is Your Landing Page Losing You Money?",
    description:
      "AI scores your landing page and tells you exactly what to fix. Free scan in 30 seconds.",
    url: "https://pagescore-tau.vercel.app",
    siteName: "PageScore",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PageScore — AI Landing Page Analyzer",
    description:
      "Paste any URL. Get a score + 3 actionable fixes in 30 seconds. Free.",
  },
  keywords: [
    "landing page analyzer",
    "landing page score",
    "AI landing page audit",
    "website analyzer",
    "conversion optimization",
    "landing page checker",
    "free landing page tool",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PHProvider>{children}</PHProvider>
      </body>
    </html>
  );
}
