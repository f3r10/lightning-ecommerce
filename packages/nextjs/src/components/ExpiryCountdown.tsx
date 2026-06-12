"use client";

import { useEffect, useState } from "react";

interface ExpiryCountdownProps {
  /** Unix timestamp (seconds) when the invoice expires. */
  expiryUnix: number;
  className?: string;
}

function secondsRemaining(expiryUnix: number): number {
  return Math.max(0, Math.floor(expiryUnix - Date.now() / 1000));
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Displays the time remaining until `expiryUnix` in mm:ss format.
 * Updates every second. Shows "Expired" in red once the countdown reaches zero.
 */
export function ExpiryCountdown({ expiryUnix, className }: ExpiryCountdownProps) {
  const [remaining, setRemaining] = useState(() => secondsRemaining(expiryUnix));

  useEffect(() => {
    setRemaining(secondsRemaining(expiryUnix));

    if (secondsRemaining(expiryUnix) <= 0) return;

    const id = setInterval(() => {
      const r = secondsRemaining(expiryUnix);
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [expiryUnix]);

  if (remaining <= 0) {
    return (
      <span className={className} style={{ color: "red" }}>
        Expired
      </span>
    );
  }

  return <span className={className}>Expires in {formatTime(remaining)}</span>;
}
