"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function VersionGuard() {
  const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION;
  const dismissed = useRef(false);

  useEffect(() => {
    if (!currentVersion) return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    let lastCheck = 0;
    const check = async () => {
      if (dismissed.current) return;
      lastCheck = Date.now();
      try {
        const res = await fetch(`${basePath}/version.json`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { version: string };
        if (data.version && data.version !== currentVersion) {
          dismissed.current = true;
          toast("A new version is available", {
            description: `${currentVersion} → ${data.version}`,
            duration: Infinity,
            action: {
              label: "Reload",
              onClick: () => window.location.reload(),
            },
          });
        }
      } catch {
        // Network error — skip silently
      }
    };

    // Only visible tabs check: background tabs make no requests
    const run = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < CHECK_INTERVAL) return;
      void check();
    };
    const id = setInterval(run, 60_000);
    // Coming back to the tab checks right away when the last check is old
    document.addEventListener("visibilitychange", run);
    // First check after a short delay so the app loads first
    const timeout = setTimeout(() => {
      if (document.visibilityState === "visible") void check();
    }, 10_000);

    return () => {
      clearInterval(id);
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", run);
    };
  }, [currentVersion]);

  return null;
}
