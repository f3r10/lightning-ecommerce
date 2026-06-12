"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

/**
 * Copies `text` to the clipboard on click.
 * Shows "Copied!" for 2 seconds, then reverts to the original label.
 */
export function CopyButton({
  text,
  label = "Copy invoice",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard API unavailable (e.g. non-HTTPS context) — fail silently.
    });
  };

  return (
    <button type="button" onClick={handleCopy} className={className}>
      {copied ? "Copied!" : label}
    </button>
  );
}
