import type { Metadata } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PHProvider } from "./providers";
import Sidebar from "@/components/Sidebar";

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
    url: "https://alpo.com",
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
      <body className="antialiased font-[family-name:var(--font-inter)]">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--brand)] focus:text-white focus:text-sm focus:font-semibold">
          Skip to content
        </a>
        <PHProvider>
          <Sidebar />
          <div className="md:pl-16 h-dvh bg-[var(--surface-container)] md:py-2">
            <div className="h-full bg-[var(--surface-container-lowest)] overflow-y-auto md:rounded-[2rem] md:mr-2 scrollbar-outside" style={{ boxShadow: "0 4px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)" }}>
              {children}
            </div>
          </div>
        </PHProvider>
      </body>
    </html>
  );
}
