// The provider registry is llm-connect's: one registry per app, shared with
// llm-connect's `createModel` / `loadModel` and its `llm-connect/providers/*`
// modules, so a provider registered through either package serves both.
export {
  registerProvider,
  registerProviders,
  fromSDK,
  getProvider,
  hasProvider,
  clearProviders,
  requireProvider,
  OPENAI_DEFAULT_BASE_URL,
} from "llm-connect";
export type { ProviderConfig, ProviderFactory } from "llm-connect";
