"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";

interface FullscreenCardProps {
    children: React.ReactNode;
    title?: string;
    className?: string;
}

export function FullscreenCard({ children, title: _title, className = "" }: FullscreenCardProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Wait for client-side mount
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Prevent scrolling on body when in fullscreen
    useEffect(() => {
        if (isFullscreen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isFullscreen]);

    // Handle escape key to exit fullscreen
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

    // Don't render interactive elements until mounted (avoids hydration issues)
    if (!isMounted) {
        return (
            <div className={`relative ${className}`}>
                {children}
            </div>
        );
    }

    // The content that will be rendered (same reference to preserve state)
    const content = (
        <div ref={contentRef} className={isFullscreen ? "" : className}>
            {children}
        </div>
    );

    if (isFullscreen) {
        return (
            <>
                {/* Placeholder in DOM to maintain scroll position */}
                <div className={className} style={{ minHeight: "200px", opacity: 0.3 }}>
                    <div className="flex items-center justify-center h-full text-gray-500 p-8">
                        Viewing in fullscreen mode...
                    </div>
                </div>

                {/* Portal to body for true fullscreen */}
                {createPortal(
                    <div
                        className="fixed inset-0 bg-slate-950 overflow-auto"
                        style={{ zIndex: 99999 }}
                    >
                        {/* Background pattern */}
                        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

                        {/* Header controls */}
                        <div 
                            className="fixed top-4 right-4 flex gap-2"
                            style={{ zIndex: 100000 }}
                        >
                            <button
                                onClick={toggleFullscreen}
                                className="p-2 rounded-xl bg-gray-900/90 hover:bg-gray-800 text-gray-300 hover:text-white border border-white/20 backdrop-blur-md shadow-lg transition-all"
                                title="Exit Fullscreen (Esc)"
                            >
                                <Minimize2 className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setIsFullscreen(false)}
                                className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 backdrop-blur-md transition-colors"
                                title="Close (Esc)"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className={`relative min-h-full p-6 pt-16 ${className}`}>
                            {children}
                        </div>
                    </div>,
                    document.body
                )}
            </>
        );
    }

    return (
        <div className={`group relative ${className}`}>
            {/* Fullscreen button */}
            <div className="absolute top-4 right-4 z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-xl bg-gray-900/80 hover:bg-gray-800 text-gray-300 hover:text-white border border-white/10 backdrop-blur-md shadow-lg transition-all"
                    title="Enter Fullscreen"
                >
                    <Maximize2 className="w-5 h-5" />
                </button>
            </div>

            {content}
        </div>
    );
}
