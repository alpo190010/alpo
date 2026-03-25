import type { Metadata } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PHProvider } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "alpo.ai — Find Revenue Leaks on Your Product Page | Free in 30 Seconds",
  description:
    "Paste any Shopify product URL. Get an AI-powered leak report on 7 conversion factors with actionable fixes in 30 seconds. Free. No signup.",
  openGraph: {
    title: "alpo.ai — Is Your Product Page Bleeding Sales?",
    description:
      "AI finds revenue leaks on your Shopify product page — title, images, pricing, reviews, CTA and more. Free scan in 30 seconds.",
    url: "https://pageleaks.com",
    siteName: "alpo.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "alpo.ai — Find Revenue Leaks on Your Product Page",
    description:
      "Paste your Shopify product URL. Find leaks + get fixes in 30 seconds. Free.",
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
    <html lang="en" className={`${inter.variable} ${manrope.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Preconnect to AI API for faster analysis start */}
        <link rel="preconnect" href="https://openrouter.ai" />
        <link rel="dns-prefetch" href="https://openrouter.ai" />
      </head>
      <body className="antialiased font-[family-name:var(--font-inter)]">
        <PHProvider>{children}</PHProvider>
      </body>
    </html>
  );
}
