"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Settings, X, Check } from "lucide-react";
import {
  type CSVSettings,
  DEFAULT_CSV_SETTINGS,
} from "~/lib/csv-parser";
import { loadCsvSettings, saveCsvSettings } from "~/lib/storage";

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

  if (!isOpen || !mounted) return null;

  const handleSave = () => {
    saveCsvSettings(localSettings);
    onSettingsChange(localSettings);
    onClose();
  };

  const modalContent = (
    <>
      {/* SOLID Backdrop */}
      <div 
        className="fixed inset-0 z-[100] bg-gray-950/90 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div
        className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="pointer-events-auto w-full max-w-md rounded-2xl bg-gray-900 border-2 border-cyan-500/60 shadow-[0_0_60px_rgba(6,182,212,0.3)] animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-white/10 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40">
                  <Settings className="w-5 h-5 text-cyan-400" />
                </div>
                <h2 className="text-xl font-bold text-white">CSV Settings</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Delimiter */}
            <div>
              <label
                htmlFor="delimiter-select"
                className="block text-sm font-semibold text-gray-200 mb-2"
              >
                Delimiter
              </label>
              <select
                id="delimiter-select"
                value={localSettings.delimiter}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, delimiter: e.target.value }))
                }
                className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
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
                className="block text-sm font-semibold text-gray-200 mb-2"
              >
                Encoding
              </label>
              <select
                id="encoding-select"
                value={localSettings.encoding}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, encoding: e.target.value }))
                }
                className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              >
                {ENCODINGS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Has Header */}
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl border border-gray-700">
              <div>
                <p className="text-sm font-semibold text-gray-200">First row is header</p>
                <p className="text-xs text-gray-500">Use first row as column names</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setLocalSettings((s) => ({ ...s, hasHeader: !s.hasHeader }))
                }
                className={`
                  w-14 h-7 rounded-full transition-all duration-200 relative
                  ${localSettings.hasHeader ? "bg-cyan-500" : "bg-gray-600"}
                `}
              >
                <div
                  className={`
                    absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-md
                    ${localSettings.hasHeader ? "left-8" : "left-1"}
                  `}
                />
              </button>
            </div>

            {/* Skip Empty Lines */}
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl border border-gray-700">
              <div>
                <p className="text-sm font-semibold text-gray-200">Skip empty lines</p>
                <p className="text-xs text-gray-500">Ignore blank rows in the file</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setLocalSettings((s) => ({ ...s, skipEmptyLines: !s.skipEmptyLines }))
                }
                className={`
                  w-14 h-7 rounded-full transition-all duration-200 relative
                  ${localSettings.skipEmptyLines ? "bg-cyan-500" : "bg-gray-600"}
                `}
              >
                <div
                  className={`
                    absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-md
                    ${localSettings.skipEmptyLines ? "left-8" : "left-1"}
                  `}
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
                className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 font-medium hover:bg-gray-750 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-semibold hover:from-cyan-500 hover:to-teal-500 transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
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

  useEffect(() => {
    const stored = loadCsvSettings();
    if (stored) {
      onSettingsChange({ ...DEFAULT_CSV_SETTINGS, ...stored });
    }
  }, [onSettingsChange]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 border-2 border-cyan-500 text-white font-medium hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-500/25"
      >
        <Settings className="w-4 h-4" />
        <span className="text-sm">CSV Settings</span>
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
