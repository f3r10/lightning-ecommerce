"use client";

import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

/**
 * Renders an arbitrary string as a QR code on a <canvas> element.
 * Rendering is deferred to useEffect to avoid SSR/hydration mismatches.
 */
export function QRCode({ value, size = 240, className }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCodeLib.toCanvas(canvas, value, { width: size, margin: 2 }, (err) => {
      if (err) console.error("QRCode render error:", err);
    });
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      aria-label="Lightning invoice QR code"
    />
  );
}
