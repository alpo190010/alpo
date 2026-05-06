import type { Metadata } from "next";
import SharePageContent from "./SharePageContent";

/**
 * Server-component shim — exports metadata for noindex/nofollow so
 * search engines can't index every share URL anyone publishes, then
 * defers to the client component for the actual fetch + render.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharePageContent token={token} />;
}
