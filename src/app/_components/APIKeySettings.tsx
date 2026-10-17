"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "~/lib/use-focus-trap";
import { toast } from "sonner";
import {
  Key,
  X,
  Eye,
  EyeOff,
  Check,
  Globe,
  Server,
  AlertTriangle,
  Loader2,
  Zap,
} from "lucide-react";
import {
  ENDPOINT_PRESETS,
  isConfigured,
  liveCatalog,
  RESPONSE_LANGUAGES,
} from "llm-connect";
import { useLlmStore } from "llm-connect/react";
import { apiSettingsStorage, type StoredSettings } from "~/lib/storage";

/** Local OpenAI-compatible servers offered as quick setups. */
const LOCAL_PRESETS = [ENDPOINT_PRESETS.ollama, ENDPOINT_PRESETS.lmstudio];

// Built in the browser from models.dev on first open, shared by every dialog;
// the models.json written at build time is the fallback.
const catalog = liveCatalog({
  fallbackUrl: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/models.json`,
});

const INSECURE_ENDPOINT = {
  title: "Plain http is only allowed to this computer",
  description:
    "Use an https URL for a remote server, so your key never travels in clear text. http://localhost works for Ollama and LM Studio.",
};

interface APIKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
  /** New settings, or null once cleared. */
  onSettingsChange: (settings: StoredSettings | null) => void;
  currentSettings: StoredSettings | null;
}

export function APIKeySettings({
  isOpen,
  onClose,
  onSettingsChange,
  currentSettings,
}: APIKeySettingsProps) {
  const { state, store } = useLlmStore({
    catalog,
    storage: apiSettingsStorage,
  });
  const { draft } = state;
  const useCustomEndpoint = draft.custom;

  const [showKey, setShowKey] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Every open starts from the page's settings: unsaved edits are discarded,
  // and the catalog is downloaded (once)
  useEffect(() => {
    if (!isOpen) return;
    setShowKey(false);
    store.reset(currentSettings);
    store.open();
  }, [isOpen, currentSettings, store]);

  // Escape closes the dialog
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen && mounted);

  if (!isOpen || !mounted) return null;

  const selectedProvider = state.provider;
  const isLoadingCatalog = state.catalogStatus === "loading";
  const catalogError = state.catalogError;

  const handleTestApiKey = async () => {
    const { providerName } = store.settings();
    const result = await store.test();

    if (!result.ok && result.reason === "insecure") {
      toast.error(INSECURE_ENDPOINT.title, {
        description: INSECURE_ENDPOINT.description,
      });
      return;
    }

    if (useCustomEndpoint) {
      if (result.ok) {
        toast.success("Connection successful!", {
          description: result.modelCount
            ? `${result.modelCount} model(s) available`
            : "Server is reachable",
        });
      } else if (result.reason === "auth" || result.reason === "http") {
        toast.error("Connection failed", {
          description: `Server returned status ${result.status}`,
        });
      } else {
        toast.error("CORS error — enable CORS in your server", {
          description:
            "LM Studio: Settings > Enable CORS. " +
            "Ollama: set OLLAMA_ORIGINS=* then restart.",
          duration: 10000,
        });
      }
      return;
    }

    if (result.ok) {
      toast.success("API key is valid!", {
        description: `Connected to ${providerName}`,
      });
    } else if (result.reason === "config") {
      toast.error("Could not call this model", {
        description: result.message,
      });
    } else if (result.reason === "auth") {
      toast.error("Invalid API key", {
        description: "The provider rejected your API key.",
      });
    } else if (result.reason === "http") {
      toast.error("Connection issue", {
        description: `Server returned status ${result.status}`,
      });
    } else {
      toast.error("Could not reach provider", {
        description:
          "Network error or CORS not supported. Your key may still work.",
      });
    }
  };

  const handleSave = async () => {
    const result = await store.save();
    if (!result.ok) {
      if (result.reason === "invalid-endpoint")
        toast.error("Invalid endpoint URL", {
          description:
            "Please enter a valid URL (e.g., http://localhost:11434/v1).",
        });
      else if (result.reason === "insecure-endpoint")
        toast.error(INSECURE_ENDPOINT.title, {
          description: INSECURE_ENDPOINT.description,
        });
      return;
    }
    const settings = result.settings;
    onSettingsChange(settings);
    toast.success("Settings Saved", {
      description: settings.customEndpoint
        ? `Using ${settings.customModel} at ${settings.customEndpoint}`
        : `Using ${settings.providerName} with ${settings.model.split("/").pop() ?? settings.model}`,
    });
    onClose();
  };

  const handleClear = async () => {
    try {
      await store.clear();
    } catch (error) {
      toast.error("Could not clear the settings", {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    onSettingsChange(null);
    toast.success("Settings cleared", {
      description:
        "The API key and preferences were removed from this browser.",
    });
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
        aria-labelledby="api-settings-title"
      >
        <div
          ref={modalRef}
          // Fixed height: only the content scrolls, so the footer buttons never
          // move when the model list arrives
          className="animate-scale-in pointer-events-auto flex h-[min(90vh,56rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border-2 border-violet-500/60 bg-gray-900 shadow-[0_0_60px_rgba(139,92,246,0.3)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="shrink-0 border-b border-white/10 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-violet-500/40 bg-violet-500/20 p-2.5">
                  <Key className="h-5 w-5 text-violet-400" />
                </div>
                <h2
                  id="api-settings-title"
                  className="text-xl font-bold text-white"
                >
                  API Configuration
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!state.canSave}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close API settings"
                  className="rounded-lg p-2 transition-colors hover:bg-white/10"
                >
                  <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Current Model Display */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              {(currentSettings?.customEndpoint &&
                currentSettings?.customModel) ||
              currentSettings?.model ? (
                <div>
                  <p className="mb-1 text-xs text-gray-500">Current model</p>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                    <p className="truncate text-sm font-semibold text-white">
                      {(() => {
                        // If using custom endpoint, show custom model name
                        if (
                          currentSettings.customEndpoint &&
                          currentSettings.customModel
                        ) {
                          return currentSettings.customModel;
                        }
                        // Otherwise, try to find the model name from the catalog
                        const currentModel = state.catalog
                          ? Object.values(state.catalog)
                              .flatMap((provider) =>
                                Object.values(provider.models),
                              )
                              .find((m) => m.id === currentSettings.model)
                          : null;
                        return currentModel?.name ?? currentSettings.model;
                      })()}
                    </p>
                  </div>
                  {currentSettings.customEndpoint ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Endpoint: {currentSettings.customEndpoint}
                    </p>
                  ) : currentSettings.providerName ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Provider: {currentSettings.providerName}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <p className="text-sm text-amber-400">
                    No model selected - please configure below
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            {/* Custom Endpoint Toggle */}
            <div>
              <label className="flex cursor-pointer items-center gap-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={useCustomEndpoint}
                    onChange={(e) => {
                      // The store keeps each key in its own slot
                      store.toggleCustom(e.target.checked);
                      setShowKey(false);
                    }}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-700 peer-checked:bg-violet-600 peer-focus:ring-2 peer-focus:ring-violet-500/20 peer-focus:outline-none after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                </div>
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-200">
                    Use Custom Endpoint
                  </span>
                </div>
              </label>
              <p className="mt-2 text-xs text-gray-500">
                Connect to OpenAI-compatible APIs (Ollama, LM Studio, vLLM,
                etc.)
              </p>
            </div>

            {/* Custom Endpoint Fields */}
            {useCustomEndpoint && (
              <div className="space-y-4 rounded-xl border border-gray-700 bg-gray-800/50 p-4">
                {/* Quick Presets */}
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                    Quick Setup
                  </p>
                  <div className="flex gap-2">
                    {LOCAL_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => store.applyPreset(preset)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          draft.customEndpoint === preset.endpoint
                            ? "border-violet-500 bg-violet-500/20 text-violet-300"
                            : "border-gray-700 bg-gray-800 text-gray-300 hover:border-violet-500/50 hover:bg-violet-500/10"
                        }`}
                      >
                        <Server className="h-3.5 w-3.5" />
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="custom-endpoint-input"
                    className="mb-2 block text-sm font-semibold text-gray-200"
                  >
                    API Base URL
                  </label>
                  <input
                    id="custom-endpoint-input"
                    type="text"
                    value={draft.customEndpoint}
                    onChange={(e) => store.setEndpoint(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Example: http://localhost:11434/v1 for Ollama
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="custom-model-input"
                    className="mb-2 block text-sm font-semibold text-gray-200"
                  >
                    Model Name
                  </label>
                  <input
                    id="custom-model-input"
                    type="text"
                    value={draft.customModel}
                    onChange={(e) => store.setCustomModel(e.target.value)}
                    placeholder="llama3.2, mistral, codellama, etc."
                    className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    The model name as configured in your server
                  </p>
                </div>

                {/* CORS hint */}
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-xs text-amber-300">
                    <strong>CORS must be enabled</strong> on your local server.
                    <br />
                    LM Studio: Settings &gt; Enable CORS
                    <br />
                    Ollama: set{" "}
                    <code className="rounded bg-black/30 px-1">
                      OLLAMA_ORIGINS=*
                    </code>{" "}
                    then restart
                  </p>
                </div>
              </div>
            )}

            {/* API Key Input */}
            <div>
              <label
                htmlFor="api-key-input"
                className="mb-2 block text-sm font-semibold text-gray-200"
              >
                {useCustomEndpoint ? "API Key (optional)" : "Provider API Key"}
              </label>
              <div className="relative">
                <input
                  id="api-key-input"
                  type={showKey ? "text" : "password"}
                  value={state.apiKey}
                  onChange={(e) => store.setApiKey(e.target.value)}
                  placeholder={
                    useCustomEndpoint ? "Leave empty if not required" : "sk-..."
                  }
                  className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3 pr-12 text-white placeholder-gray-500 transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  aria-pressed={showKey}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 transition-colors hover:bg-white/10"
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={draft.rememberKey}
                  onChange={(e) => store.setRememberKey(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-violet-600"
                />
                <span>Remember on this device</span>
              </label>
              <p
                id="api-key-storage-hint"
                className="mt-2 text-xs text-gray-500"
              >
                🔒 Encrypted with a browser key that cannot be exported,{" "}
                {draft.rememberKey
                  ? "and kept on this device until you clear it. "
                  : "for this tab only: forgotten when you close it. "}
                It is sent only to the AI provider you choose, never to this
                site.
              </p>
            </div>

            {/* catalog status & refresh UI removed — we use only the simple model selector for users */}

            {!useCustomEndpoint && catalogError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
              >
                <span>Could not load the model list. {catalogError}.</span>
                <button
                  type="button"
                  onClick={store.retryCatalog}
                  disabled={isLoadingCatalog}
                  className="shrink-0 rounded-lg border border-red-400/40 px-3 py-1.5 font-medium hover:bg-red-500/10 disabled:opacity-50"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Provider Selection */}
            {!useCustomEndpoint && (
              <div className="space-y-2">
                <label
                  htmlFor="provider-select"
                  className="mb-1 block text-sm font-semibold text-gray-200"
                >
                  Provider
                </label>
                <select
                  id="provider-select"
                  value={draft.providerId}
                  // Also picks the provider's recommended model: a model of the
                  // previous provider would be sent to the new one
                  onChange={(e) => store.selectProvider(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3 text-white transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                >
                  {state.providers.recommended.length > 0 && (
                    <optgroup label="Recommended">
                      {state.providers.recommended.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {state.providers.others.length > 0 && (
                    <optgroup label="Other Providers">
                      {state.providers.others.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-xs text-gray-500">
                  Pick the provider to populate models.
                </p>
                {state.providers.others.some(
                  (p) => p.id === draft.providerId,
                ) && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div className="text-sm leading-relaxed text-(--text-primary)">
                      {draft.providerId === "zai" ||
                      draft.providerId === "zai-coding-plan" ? (
                        <>
                          <strong className="font-semibold">
                            Z.ai browser access:
                          </strong>{" "}
                          Z.ai currently blocks direct requests from this site
                          (CORS). Use a server relay you control via Custom
                          Endpoint, or a provider that supports browser
                          requests. GitHub Pages cannot run the relay. Changing
                          your API key will not resolve a CORS block.
                        </>
                      ) : (
                        <>
                          <strong className="font-semibold">Important:</strong>{" "}
                          This provider must be OpenAI-compatible and support{" "}
                          <strong>client-side requests</strong> (CORS enabled).
                          Server-only APIs will not work in the browser.
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Model Selection - Only show when not using custom endpoint */}
            {!useCustomEndpoint && (
              <div>
                <label className="mb-3 block text-sm font-semibold text-gray-200">
                  Model
                </label>

                {/* Recommended Model Badge - Above search */}
                {selectedProvider &&
                  (() => {
                    const recommendedModel = state.recommendedModel;

                    return recommendedModel ? (
                      <div className="mb-3">
                        <div className="mb-2 flex items-center gap-2">
                          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                          <span className="text-xs font-semibold tracking-wide text-emerald-400 uppercase">
                            Recommended
                          </span>
                        </div>
                        <button
                          key={recommendedModel.id}
                          type="button"
                          aria-pressed={draft.model === recommendedModel.id}
                          onClick={() => store.selectModel(recommendedModel.id)}
                          className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                            draft.model === recommendedModel.id
                              ? "border-emerald-500 bg-emerald-500/20"
                              : "border-emerald-500/50 bg-emerald-500/10 hover:border-emerald-500 hover:bg-emerald-500/15"
                          } `}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-gray-200">
                                {recommendedModel.name}
                              </span>
                              <p className="mt-1 text-xs text-gray-500">
                                {selectedProvider.name}
                              </p>
                            </div>
                            {draft.model === recommendedModel.id && (
                              <Check className="h-5 w-5 shrink-0 text-emerald-400" />
                            )}
                          </div>
                        </button>
                      </div>
                    ) : null;
                  })()}

                {/* Search field to filter the models list */}
                <div className="mb-3">
                  <label htmlFor="model-search" className="sr-only">
                    Search models
                  </label>
                  <input
                    id="model-search"
                    type="text"
                    value={state.search}
                    onChange={(e) => store.setSearch(e.target.value)}
                    placeholder="Search models (name or id)"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                  />
                </div>

                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {state.models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={draft.model === m.id}
                      onClick={() => store.selectModel(m.id)}
                      className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                        draft.model === m.id
                          ? "border-violet-500 bg-violet-500/20"
                          : "border-gray-700 bg-gray-800 hover:border-gray-600"
                      } `}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-gray-200">
                            {m.name}
                          </span>
                          <p className="mt-1 text-xs text-gray-500">
                            {selectedProvider?.name}
                          </p>
                        </div>
                        {draft.model === m.id && (
                          <Check className="h-5 w-5 text-violet-400" />
                        )}
                      </div>
                      <div className="mt-2 flex gap-2 text-[11px] text-gray-400">
                        {m.tool_call && (
                          <span className="rounded bg-white/10 px-2 py-0.5">
                            Tools
                          </span>
                        )}
                        {m.reasoning && (
                          <span className="rounded bg-white/10 px-2 py-0.5">
                            Reasoning
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  {state.models.length === 0 && (
                    <p className="text-sm text-gray-500">
                      {isLoadingCatalog
                        ? "Loading models…"
                        : catalogError
                          ? "Models are unavailable until the list loads."
                          : state.search.trim()
                            ? "No model matches your search."
                            : "No models available for this provider."}
                    </p>
                  )}
                  {state.models.length > 0 && !draft.model && (
                    <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-sm text-amber-400">
                        Please select a model to continue
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Language Selection */}
            <div>
              <label
                htmlFor="language-select"
                className="mb-2 block text-sm font-semibold text-gray-200"
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Response Language
                </div>
              </label>
              <select
                id="language-select"
                value={draft.language}
                onChange={(e) => store.setLanguage(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3 text-white transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
              >
                {RESPONSE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">
                AI responses will be generated in this language
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 gap-3 border-t border-white/10 px-6 py-4">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-xl border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleTestApiKey}
              disabled={state.testing || !state.canTest}
              className="flex items-center gap-1.5 rounded-xl border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Test
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!state.canSave}
              className="rounded-xl bg-linear-to-r from-violet-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}

interface APIKeyButtonProps {
  onSettingsChange: (settings: StoredSettings | null) => void;
  /** Loaded by the page (see loadApiSettings). */
  currentSettings: StoredSettings | null;
}

export function APIKeyButton({
  onSettingsChange,
  currentSettings,
}: APIKeyButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasKey = isConfigured(currentSettings);

  return (
    <>
      <button
        type="button"
        aria-label="API settings"
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
          hasKey
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            : "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
        }`}
      >
        <Key className="h-4 w-4" />
        <span className="hidden sm:inline">{hasKey ? "API" : "API Key"}</span>
        {hasKey && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
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
