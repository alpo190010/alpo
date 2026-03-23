import type { Metadata } from "next";
import "./globals.css";
import { PHProvider } from "./providers";

export const metadata: Metadata = {
  title: "PageScore — Shopify Product Page Analyzer | Free Score in 30 Seconds",
  description:
    "Paste any Shopify product URL. Get an AI-powered score (0-100) on 7 conversion factors with actionable fixes in 30 seconds. Free. No signup.",
  openGraph: {
    title: "PageScore — Is Your Shopify Product Page Losing You Sales?",
    description:
      "AI scores your Shopify product page on title, images, pricing, reviews, CTA and more. Free scan in 30 seconds.",
    url: "https://alpo.ai",
    siteName: "PageScore",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PageScore — Shopify Product Page Analyzer",
    description:
      "Paste your Shopify product URL. Get a score + fixes in 30 seconds. Free.",
  },
  keywords: [
    "shopify product page analyzer",
    "shopify conversion rate optimization",
    "shopify product page score",
    "AI product page audit",
    "ecommerce conversion optimizer",
    "shopify store optimizer",
    "product page checker",
    "free shopify tool",
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
