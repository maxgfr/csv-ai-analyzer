"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "~/lib/use-focus-trap";
import { toast } from "sonner";
import { Settings, X, Check } from "lucide-react";
import type { CSVSettings } from "~/lib/csv-parser";

interface CSVSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CSVSettings;
  onSettingsChange: (settings: CSVSettings) => void;
}

const DELIMITERS = [
  { value: "", label: "Auto-detect" },
  { value: ",", label: "Comma (,)" },
  { value: ";", label: "Semicolon (;)" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe (|)" },
];

const ENCODINGS = [
  { value: "UTF-8", label: "UTF-8" },
  { value: "ISO-8859-1", label: "ISO-8859-1 (Latin-1)" },
  { value: "Windows-1252", label: "Windows-1252" },
];

export function CSVSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: CSVSettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<CSVSettings>(settings);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen && mounted);

  if (!isOpen || !mounted) return null;

  const handleSave = () => {
    onSettingsChange(localSettings);
    toast.success("CSV Settings Saved", {
      description: "Parser settings have been updated",
    });
    onClose();
  };

  const modalContent = (
    <>
      {/* SOLID Backdrop */}
      <div
        className="fixed inset-0 z-100 bg-gray-950/90 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="pointer-events-none fixed inset-0 z-101 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          ref={modalRef}
          className="animate-scale-in pointer-events-auto w-full max-w-md rounded-2xl border-2 border-cyan-500/60 bg-gray-900 shadow-[0_0_60px_rgba(6,182,212,0.3)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-white/10 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/20 p-2.5">
                  <Settings className="h-5 w-5 text-cyan-400" />
                </div>
                <h2 className="text-xl font-bold text-white">
                  Parser Settings
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 transition-colors hover:bg-white/10"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-5 p-6">
            <p className="text-xs text-gray-500">
              Delimiter and encoding apply to CSV files only. Excel (.xlsx)
              files are parsed automatically.
            </p>

            {/* Delimiter */}
            <div>
              <label
                htmlFor="delimiter-select"
                className="mb-2 block text-sm font-semibold text-gray-200"
              >
                Delimiter
              </label>
              <select
                id="delimiter-select"
                value={localSettings.delimiter}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, delimiter: e.target.value }))
                }
                className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3 text-white transition-all focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none"
              >
                {DELIMITERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Encoding */}
            <div>
              <label
                htmlFor="encoding-select"
                className="mb-2 block text-sm font-semibold text-gray-200"
              >
                Encoding
              </label>
              <select
                id="encoding-select"
                value={localSettings.encoding}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, encoding: e.target.value }))
                }
                className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3 text-white transition-all focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none"
              >
                {ENCODINGS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Has Header */}
            <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 p-4">
              <div>
                <p className="text-sm font-semibold text-gray-200">
                  First row is header
                </p>
                <p className="text-xs text-gray-500">
                  Use first row as column names
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setLocalSettings((s) => ({ ...s, hasHeader: !s.hasHeader }))
                }
                className={`relative h-7 w-14 rounded-full transition-all duration-200 ${localSettings.hasHeader ? "bg-cyan-500" : "bg-gray-600"} `}
              >
                <div
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all ${localSettings.hasHeader ? "left-8" : "left-1"} `}
                />
              </button>
            </div>

            {/* Skip Empty Lines */}
            <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 p-4">
              <div>
                <p className="text-sm font-semibold text-gray-200">
                  Skip empty lines
                </p>
                <p className="text-xs text-gray-500">
                  Ignore blank rows in the file
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setLocalSettings((s) => ({
                    ...s,
                    skipEmptyLines: !s.skipEmptyLines,
                  }))
                }
                className={`relative h-7 w-14 rounded-full transition-all duration-200 ${localSettings.skipEmptyLines ? "bg-cyan-500" : "bg-gray-600"} `}
              >
                <div
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all ${localSettings.skipEmptyLines ? "left-8" : "left-1"} `}
                />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 px-6 py-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="hover:bg-gray-750 flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 font-medium text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-cyan-600 to-teal-600 px-4 py-3 font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:from-cyan-500 hover:to-teal-500"
              >
                <Check className="h-4 w-4" />
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}

interface CSVSettingsButtonProps {
  settings: CSVSettings;
  onSettingsChange: (settings: CSVSettings) => void;
}

export function CSVSettingsButton({
  settings,
  onSettingsChange,
}: CSVSettingsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Parser settings"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">CSV</span>
      </button>
      <CSVSettingsModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    </>
  );
}
