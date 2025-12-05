import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CSV AI Analyzer | Analyze your data with AI",
  description:
    "Upload your CSV files and generate intelligent charts with AI. 100% local, your data stays in your browser.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  keywords: ["CSV", "AI", "analysis", "charts", "visualization", "data", "OpenAI", "GPT"],
  authors: [{ name: "CSV AI Analyzer" }],
  openGraph: {
    title: "CSV AI Analyzer | Analyze your data with AI",
    description: "Upload your CSV files and generate intelligent charts with AI. 100% local processing.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "CSV AI Analyzer",
    description: "Analyze your CSV data with AI. 100% local, privacy-first.",
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

// JSON-LD structured data
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "CSV AI Analyzer",
  "description": "Upload your CSV files and generate intelligent charts with AI. 100% local, your data stays in your browser.",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Any",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "featureList": [
    "AI-powered data analysis",
    "Automatic chart generation",
    "Anomaly detection",
    "Custom queries",
    "Privacy-first: data stays in browser"
  ],
  "browserRequirements": "Requires JavaScript. Works on modern browsers.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {/* Background effects */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="floating-orb floating-orb-1" />
          <div className="floating-orb floating-orb-2" />
          <div className="floating-orb floating-orb-3" />
          <div className="absolute inset-0 bg-grid-pattern" />
        </div>

        {/* Main content */}
        <div className="relative z-10">{children}</div>

        {/* Footer with legal link */}
        <footer className="relative z-10 text-center py-6 text-sm text-gray-500">
          <Link href="/legal" className="hover:text-violet-400 transition-colors">
            Privacy & Legal
          </Link>
        </footer>
      </body>
    </html>
  );
}
