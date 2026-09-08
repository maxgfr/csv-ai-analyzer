"use client";

import { useState, useEffect, useRef } from "react";
import { useFocusTrap } from "~/lib/use-focus-trap";
import { Maximize2, Minimize2, X } from "lucide-react";

interface FullscreenCardProps {
  children: React.ReactNode;
  className?: string;
}

export function FullscreenCard({
  children,
  className = "",
}: FullscreenCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useFocusTrap(containerRef, isFullscreen);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  // Always render the same tree structure so children keep their React identity
  // and never lose state. We toggle CSS classes instead of using a portal.
  return (
    <div
      ref={containerRef}
      role={isFullscreen ? "dialog" : undefined}
      aria-modal={isFullscreen || undefined}
      aria-label={isFullscreen ? "Fullscreen view" : undefined}
      className={
        isFullscreen
          ? "fixed inset-0 z-[99999] flex flex-col overflow-auto"
          : `group relative ${className}`
      }
      style={
        isFullscreen ? { backgroundColor: "var(--bg-body-start)" } : undefined
      }
    >
      {/* Controls — always at tree position 0 */}
      <div
        className={
          isFullscreen
            ? "fixed top-4 right-4 z-[100000] flex gap-2"
            : "absolute top-4 right-4 z-50 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        }
      >
        {isMounted &&
          (isFullscreen ? (
            <>
              <button
                onClick={toggleFullscreen}
                className="rounded-xl border border-white/20 bg-gray-900/90 p-2 text-gray-300 shadow-lg backdrop-blur-md transition-all hover:bg-gray-800 hover:text-white"
                title="Exit Fullscreen (Esc)"
              >
                <Minimize2 className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="rounded-xl border border-red-500/30 bg-red-500/20 p-2 text-red-300 backdrop-blur-md transition-colors hover:bg-red-500/30"
                title="Close (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          ) : (
            <button
              onClick={toggleFullscreen}
              className="rounded-xl border border-white/10 bg-gray-900/80 p-2 text-gray-300 shadow-lg backdrop-blur-md transition-all hover:bg-gray-800 hover:text-white"
              title="Enter Fullscreen"
            >
              <Maximize2 className="h-5 w-5" />
            </button>
          ))}
      </div>

      {/* Content — always at tree position 1, children never unmount */}
      <div
        className={
          isFullscreen
            ? "relative min-h-full p-6 pt-16"
            : "flex flex-1 flex-col"
        }
      >
        {children}
      </div>
    </div>
  );
}
