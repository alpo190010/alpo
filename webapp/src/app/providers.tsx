"use client";

import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";

const PostHogLazy = dynamic(() => import("./PostHogWrapper"), { ssr: false });

export function PHProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PostHogLazy>{children}</PostHogLazy>
    </SessionProvider>
  );
}
