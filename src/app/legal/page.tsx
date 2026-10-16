import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Shield, Database, Lock, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  // The root layout's template appends " | CSV AI Analyzer"
  title: "Legal & Privacy",
  description:
    "Privacy policy and legal information for CSV AI Analyzer. Your data stays in your browser.",
  alternates: { canonical: "/legal/" },
};

export default function LegalPage() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Back Button */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to App
        </Link>

        <h1 className="mb-8 bg-gradient-to-r from-(--text-primary) to-(--text-secondary) bg-clip-text text-4xl font-bold text-transparent">
          Legal & Privacy
        </h1>

        <div className="space-y-8">
          {/* Privacy Section */}
          <section className="glass-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 p-2">
                <Shield className="h-5 w-5 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold">Privacy Policy</h2>
            </div>
            <div className="space-y-4 text-gray-300">
              <p>
                CSV AI Analyzer is designed with privacy as a core principle. We
                believe your data is yours and should stay that way.
              </p>
              <h3 className="mt-4 font-medium text-white">
                What we DON&apos;T store:
              </h3>
              <ul className="list-inside list-disc space-y-1 text-gray-400">
                <li>Your CSV files or any data you upload</li>
                <li>Your API keys on our servers</li>
                <li>Analysis results or chat history</li>
                <li>Any personally identifiable information</li>
              </ul>
            </div>
          </section>

          {/* Data Processing Section */}
          <section className="glass-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/20 p-2">
                <Database className="h-5 w-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold">
                How Your Data is Processed
              </h2>
            </div>
            <div className="space-y-4 text-gray-300">
              <p>
                All data processing happens{" "}
                <strong className="text-white">100% in your browser</strong>.
                Here&apos;s how it works:
              </p>
              <ol className="list-inside list-decimal space-y-2 text-gray-400">
                <li>
                  You upload a CSV file → it stays in your browser&apos;s memory
                </li>
                <li>
                  When you request AI analysis → only a summary is sent to the
                  AI provider
                </li>
                <li>
                  Your API key stays in your browser (see below) → it is sent
                  only to the AI provider you chose, never to us
                </li>
                <li>When you close the browser tab → all data is gone</li>
              </ol>
            </div>
          </section>

          {/* Third Party Section */}
          <section className="glass-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/20 p-2">
                <ExternalLink className="h-5 w-5 text-violet-400" />
              </div>
              <h2 className="text-xl font-semibold">Third-Party Services</h2>
            </div>
            <div className="space-y-4 text-gray-300">
              <p>
                When you use AI features, your browser sends requests directly
                to the AI provider you selected in the API settings (OpenAI,
                Anthropic, Google, Mistral, another compatible provider, or your
                own custom endpoint). Depending on the feature, a request
                contains:
              </p>
              <ul className="list-inside list-disc space-y-1 text-gray-400">
                <li>
                  Summary, charts and suggested questions: column names and
                  types, per-column statistics, a few example values and the
                  first 5 rows
                </li>
                <li>
                  Anomaly detection: the same summary plus the first 50 rows
                </li>
                <li>
                  Chat: the summary, your question and your recent questions and
                  answers
                </li>
                <li>Your API key, in the request headers</li>
              </ul>
              <p className="text-sm text-gray-400">
                Long cell values are cut to 200 characters. These requests are
                processed under your provider&apos;s own terms and privacy
                policy; review its data retention rules before analyzing
                sensitive data. With a custom endpoint on your own machine,
                nothing leaves it.
              </p>
            </div>
          </section>

          {/* API Key Security */}
          <section className="glass-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/20 p-2">
                <Lock className="h-5 w-5 text-amber-400" />
              </div>
              <h2 className="text-xl font-semibold">API Key Security</h2>
            </div>
            <div className="space-y-4 text-gray-300">
              <p>This site uses no cookies. What it stores in your browser:</p>
              <ul className="list-inside list-disc space-y-1 text-gray-400">
                <li>
                  Your API key, never in clear text: it is encrypted (AES-GCM)
                  with a browser key that cannot be exported, kept in{" "}
                  <code className="rounded bg-white/10 px-1 text-xs">
                    IndexedDB
                  </code>
                  . The encrypted key stays in{" "}
                  <code className="rounded bg-white/10 px-1 text-xs">
                    sessionStorage
                  </code>{" "}
                  for the current tab only, erased when you close it. If you
                  tick &quot;Remember on this device&quot;, it goes to IndexedDB
                  instead and stays until you press Clear or clear site data
                </li>
                <li>
                  Preferences, in{" "}
                  <code className="rounded bg-white/10 px-1 text-xs">
                    localStorage
                  </code>
                  : provider, model, response language, custom endpoint and
                  theme
                </li>
                <li>
                  The key is never sent to this site: it only travels, over
                  HTTPS, to the AI provider you selected. A custom endpoint
                  must use HTTPS, or plain HTTP on this computer (Ollama, LM
                  Studio)
                </li>
                <li>
                  A dump of the browser&apos;s storage only shows encrypted
                  bytes, but code running in this page, or a malicious browser
                  extension, can still have the browser decrypt the key: avoid
                  &quot;Remember&quot; on shared computers
                </li>
              </ul>
            </div>
          </section>

          {/* Contact */}
          <section className="glass-card p-6">
            <h2 className="mb-4 text-xl font-semibold">Contact</h2>
            <p className="text-gray-300">
              If you have any questions about our privacy practices, please open
              an issue on our GitHub repository.
            </p>
          </section>

          {/* Footer */}
          <p className="py-8 text-center text-sm text-gray-500">
            Last updated: October 2026
          </p>
        </div>
      </div>
    </main>
  );
}
