import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Shield, Database, Lock, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
    title: "Legal & Privacy - CSV AI Analyzer",
    description: "Privacy policy and legal information for CSV AI Analyzer. Your data stays in your browser.",
};

export default function LegalPage() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-950 to-black text-white p-4 md:p-8">
            <div className="max-w-3xl mx-auto">
                {/* Back Button */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to App
                </Link>

                <h1 className="text-4xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                    Legal & Privacy
                </h1>

                <div className="space-y-8">
                    {/* Privacy Section */}
                    <section className="glass-card p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                                <Shield className="w-5 h-5 text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-semibold">Privacy Policy</h2>
                        </div>
                        <div className="space-y-4 text-gray-300">
                            <p>
                                CSV AI Analyzer is designed with privacy as a core principle. We believe your data is yours and should stay that way.
                            </p>
                            <h3 className="text-white font-medium mt-4">What we DON&apos;T store:</h3>
                            <ul className="list-disc list-inside space-y-1 text-gray-400">
                                <li>Your CSV files or any data you upload</li>
                                <li>Your API keys on our servers</li>
                                <li>Analysis results or chat history</li>
                                <li>Any personally identifiable information</li>
                            </ul>
                        </div>
                    </section>

                    {/* Data Processing Section */}
                    <section className="glass-card p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                                <Database className="w-5 h-5 text-blue-400" />
                            </div>
                            <h2 className="text-xl font-semibold">How Your Data is Processed</h2>
                        </div>
                        <div className="space-y-4 text-gray-300">
                            <p>
                                All data processing happens <strong className="text-white">100% in your browser</strong>. Here&apos;s how it works:
                            </p>
                            <ol className="list-decimal list-inside space-y-2 text-gray-400">
                                <li>You upload a CSV file → it stays in your browser&apos;s memory</li>
                                <li>When you request AI analysis → only a summary is sent to the AI provider</li>
                                <li>Your API key is stored in a secure browser cookie → never sent to us</li>
                                <li>When you close the browser tab → all data is gone</li>
                            </ol>
                        </div>
                    </section>

                    {/* Third Party Section */}
                    <section className="glass-card p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-violet-500/20 border border-violet-500/30">
                                <ExternalLink className="w-5 h-5 text-violet-400" />
                            </div>
                            <h2 className="text-xl font-semibold">Third-Party Services</h2>
                        </div>
                        <div className="space-y-4 text-gray-300">
                            <p>
                                When you use AI features, your data is sent directly from your browser to:
                            </p>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <h4 className="font-medium text-white mb-2">OpenAI</h4>
                                <p className="text-sm text-gray-400">
                                    AI analysis is powered by OpenAI&apos;s API. Your data summaries are processed according to
                                    <a
                                        href="https://openai.com/policies/privacy-policy"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-violet-400 hover:text-violet-300 ml-1"
                                    >
                                        OpenAI&apos;s Privacy Policy
                                    </a>.
                                </p>
                            </div>
                            <p className="text-sm text-gray-500">
                                We recommend reviewing OpenAI&apos;s data retention policies if you&apos;re processing sensitive data.
                            </p>
                        </div>
                    </section>

                    {/* API Key Security */}
                    <section className="glass-card p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                                <Lock className="w-5 h-5 text-amber-400" />
                            </div>
                            <h2 className="text-xl font-semibold">API Key Security</h2>
                        </div>
                        <div className="space-y-4 text-gray-300">
                            <p>
                                Your OpenAI API key is stored in a browser cookie with the following security measures:
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-gray-400">
                                <li><code className="text-xs bg-white/10 px-1 rounded">Secure</code> flag: Only transmitted over HTTPS</li>
                                <li><code className="text-xs bg-white/10 px-1 rounded">SameSite=Strict</code>: Prevents cross-site request forgery</li>
                                <li>Never sent to our servers</li>
                                <li>API calls are made directly from your browser to OpenAI</li>
                            </ul>
                        </div>
                    </section>

                    {/* Contact */}
                    <section className="glass-card p-6">
                        <h2 className="text-xl font-semibold mb-4">Contact</h2>
                        <p className="text-gray-300">
                            If you have any questions about our privacy practices, please open an issue on our GitHub repository.
                        </p>
                    </section>

                    {/* Footer */}
                    <p className="text-center text-sm text-gray-500 py-8">
                        Last updated: December 2025
                    </p>
                </div>
            </div>
        </main>
    );
}
