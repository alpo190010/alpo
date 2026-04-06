"use client";

import { useState, useEffect } from "react";
import { WifiSlashIcon } from "@phosphor-icons/react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function handleOffline() { setOffline(true); }
    function handleOnline() { setOffline(false); }

    // Check initial state
    if (!navigator.onLine) setOffline(true);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[var(--error)]"
      role="alert"
      aria-live="assertive"
    >
      <WifiSlashIcon size={16} weight="bold" />
      You&apos;re offline. Some features may not work.
    </div>
  );
}
