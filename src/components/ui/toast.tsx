"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ToastVariant = "default" | "success" | "error";

interface ToastProps {
  message: string | null;
  /** Auto-dismiss after this many ms (default 3000). */
  duration?: number;
  variant?: ToastVariant;
  onDismiss?: () => void;
}

const variantClasses: Record<ToastVariant, string> = {
  default: "bg-fg text-bg",
  success: "bg-brand-gradient text-white shadow-glow",
  error: "bg-danger text-white",
};

/**
 * Toast — lightweight transient message pinned above the bottom nav.
 * Renders nothing when `message` is null. Portal-based so it can be
 * fired from anywhere without layout side effects.
 */
export function Toast({ message, duration = 3000, variant = "default", onDismiss }: ToastProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), duration);
    const removeTimer = setTimeout(() => onDismiss?.(), duration + 200);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [message, duration, onDismiss]);

  if (!mounted || !message) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+var(--safe-area-bottom))] z-50 flex justify-center px-4 transition-all duration-200"
    >
      <div
        className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lift transition-all duration-200 ${
          variantClasses[variant]
        } ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        {message}
      </div>
    </div>,
    document.body,
  );
}
