"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Key, X, Eye, EyeOff, Check, Globe } from "lucide-react";
import { loadApiSettings, saveApiSettings, type StoredSettings } from "~/lib/storage";
import { AVAILABLE_MODELS, DEFAULT_MODEL, SUPPORTED_LANGUAGES, getBrowserLanguage, type ModelId, type LanguageCode } from "~/lib/ai-models";

interface APIKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: StoredSettings) => void;
  currentSettings: StoredSettings | null;
}

export function APIKeySettings({
  isOpen,
  onClose,
  onSettingsChange,
  currentSettings,
}: APIKeySettingsProps) {
  const [apiKey, setApiKey] = useState(currentSettings?.apiKey ?? "");
  const [model, setModel] = useState<ModelId>(currentSettings?.model ?? DEFAULT_MODEL);
  const [language, setLanguage] = useState<LanguageCode>(currentSettings?.language ?? getBrowserLanguage());
  const [showKey, setShowKey] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (currentSettings) {
      setApiKey(currentSettings.apiKey);
      setModel(currentSettings.model ?? DEFAULT_MODEL);
      setLanguage(currentSettings.language ?? getBrowserLanguage());
    }
  }, [currentSettings]);

  if (!isOpen || !mounted) return null;

  const handleSave = () => {
    const settings: StoredSettings = {
      apiKey,
      model,
      language
    };
    saveApiSettings(settings);
    onSettingsChange(settings);
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
          className="pointer-events-auto w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-gray-900 border-2 border-violet-500/60 shadow-[0_0_60px_rgba(139,92,246,0.3)] animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-white/10 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40">
                  <Key className="w-5 h-5 text-violet-400" />
                </div>
                <h2 className="text-xl font-bold text-white">API Configuration</h2>
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
          <div className="p-6 space-y-6">
            {/* API Key Input */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                OpenAI API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  {showKey ? (
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                🔒 Your key is stored securely in a cookie
              </p>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-3">
                Model
              </label>
              <div className="space-y-2">
                {AVAILABLE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModel(m.id)}
                    className={`
                      w-full p-4 rounded-xl border-2 transition-all duration-200 text-left
                      ${model === m.id
                        ? "border-violet-500 bg-violet-500/20"
                        : "border-gray-700 bg-gray-800 hover:border-gray-600"
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-white">{m.name}</span>
                        <p className="text-sm text-gray-400 mt-0.5">{m.description}</p>
                      </div>
                      {model === m.id && (
                        <Check className="w-5 h-5 text-violet-400" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Language Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Response Language
                </div>
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-xl text-white focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">
                AI responses will be generated in this language
              </p>
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
                disabled={!apiKey.trim()}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/25"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}

interface APIKeyButtonProps {
  onSettingsChange: (settings: StoredSettings) => void;
  currentSettings: StoredSettings | null;
}

export function APIKeyButton({
  onSettingsChange,
  currentSettings,
}: APIKeyButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const stored = loadApiSettings();
    if (stored) {
      onSettingsChange(stored);
    }
  }, [onSettingsChange]);

  const hasKey = currentSettings?.apiKey && currentSettings.apiKey.trim() !== "";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`
          flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium
          transition-all duration-200 shadow-lg
          ${hasKey
            ? "bg-emerald-600 border-2 border-emerald-500 text-white hover:bg-emerald-500 shadow-emerald-500/25"
            : "bg-violet-600 border-2 border-violet-500 text-white hover:bg-violet-500 shadow-violet-500/25"
          }
        `}
      >
        <Key className="w-4 h-4" />
        <span className="text-sm">
          {hasKey ? "API Configured ✓" : "Configure API"}
        </span>
      </button>
      <APIKeySettings
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSettingsChange={onSettingsChange}
        currentSettings={currentSettings}
      />
    </>
  );
}
