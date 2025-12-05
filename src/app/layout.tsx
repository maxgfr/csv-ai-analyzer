import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";

const siteUrl = "https://maxgfr.github.io/csv-ai-analyzer";

export const metadata: Metadata = {
  title: {
    default: "CSV AI Analyzer | Analyze your data with AI",
    template: "%s | CSV AI Analyzer",
  },
  description:
    "Free online tool to analyze CSV files with AI. Generate intelligent charts, detect anomalies, and get insights. 100% private - your data stays in your browser.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  keywords: [
    "CSV analyzer",
    "AI data analysis",
    "CSV to chart",
    "data visualization",
    "OpenAI GPT",
    "free CSV tool",
    "online CSV viewer",
    "data anomaly detection",
    "chart generator",
    "privacy-first analytics",
  ],
  authors: [{ name: "Maxime Music", url: "https://github.com/maxgfr" }],
  creator: "Maxime Music",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "CSV AI Analyzer | Free AI-Powered Data Analysis",
    description:
      "Upload CSV files and instantly generate intelligent charts with AI. Detect anomalies, get insights, and visualize your data. 100% private - runs in your browser.",
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "CSV AI Analyzer",
  },
  twitter: {
    card: "summary_large_image",
    title: "CSV AI Analyzer | Free AI-Powered Data Analysis",
    description:
      "Upload CSV files and instantly generate intelligent charts with AI. 100% private, runs in your browser.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

// JSON-LD structured data for SEO
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "CSV AI Analyzer",
  "url": "https://maxgfr.github.io/csv-ai-analyzer",
  "description": "Free online tool to analyze CSV files with AI. Generate intelligent charts, detect anomalies, and get insights. 100% private - your data stays in your browser.",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Any",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "featureList": [
    "AI-powered data analysis",
    "Automatic chart generation from CSV",
    "Anomaly and outlier detection",
    "Natural language data queries",
    "Privacy-first: all data stays in your browser",
    "Support for OpenAI GPT models",
    "Multiple chart types: Bar, Line, Pie, Scatter, Area"
  ],
  "browserRequirements": "Requires JavaScript. Works on Chrome, Firefox, Safari, Edge.",
  "author": {
    "@type": "Person",
    "name": "Maxime Music",
    "url": "https://github.com/maxgfr"
  },
  "softwareVersion": "1.0.0"
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
        <footer className="relative z-10 text-center py-6 text-sm text-gray-500 flex items-center justify-center gap-4">
          <Link href="/legal" className="hover:text-violet-400 transition-colors">
            Privacy & Legal
          </Link>
          <span className="text-gray-600">•</span>
          <a
            href="https://github.com/maxgfr/csv-ai-analyzer"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-violet-400 transition-colors"
          >
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
