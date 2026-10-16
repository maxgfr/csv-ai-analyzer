import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Toaster } from "sonner";
import { ThemeProvider } from "~/lib/theme";
import { VersionGuard } from "./_components/VersionGuard";

const siteUrl = "https://maxgfr.github.io/csv-ai-analyzer";

export const metadata: Metadata = {
  title: {
    default: "CSV AI Analyzer | Analyze your data with AI",
    template: "%s | CSV AI Analyzer",
  },
  description:
    "Free online tool to analyze CSV files with AI. Generate intelligent charts, detect anomalies, and get insights. 100% private when using a custom endpoint",
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
      "Upload CSV files and instantly generate intelligent charts with AI. Detect anomalies, get insights, and visualize your data. 100% private when using a custom endpoint",
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "CSV AI Analyzer",
  },
  twitter: {
    card: "summary_large_image",
    title: "CSV AI Analyzer | Free AI-Powered Data Analysis",
    description:
      "Upload CSV files and instantly generate intelligent charts with AI. 100% private when using a custom endpoint",
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
  name: "CSV AI Analyzer",
  url: "https://maxgfr.github.io/csv-ai-analyzer",
  description:
    "Free online tool to analyze CSV files with AI. Generate intelligent charts, detect anomalies, and get insights. 100% private when using a custom endpoint",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "AI-powered data analysis",
    "Automatic chart generation from CSV",
    "Anomaly and outlier detection",
    "Natural language data queries",
    "Privacy-first: the app does not store your data. Use a self-hosted/custom endpoint to keep processing local",
    "Support for OpenAI GPT models",
    "Multiple chart types: Bar, Line, Pie, Scatter, Area",
  ],
  browserRequirements:
    "Requires JavaScript. Works on Chrome, Firefox, Safari, Edge.",
  author: {
    "@type": "Person",
    name: "Maxime Music",
    url: "https://github.com/maxgfr",
  },
  softwareVersion: "1.0.0",
};

// 'unsafe-eval' is only needed by the dev server (React Refresh / Turbopack)
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // AI calls go straight to the provider (https) or to a local server
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "form-action 'self'",
].join("; ");

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${geist.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Security: restrict script, style and form sources (frame-ancestors is ignored in <meta>) */}
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Anti-flash: apply theme class before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem("csv-ai-theme")||(document.cookie.match(/csv-ai-theme=(\\w+)/)||[])[1]||"auto";var d=m==="dark"||(m==="auto"&&window.matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.remove("dark","light");document.documentElement.classList.add(d?"dark":"light")}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          {/* Background effects */}
          <div className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="floating-orb floating-orb-1" />
            <div className="floating-orb floating-orb-2" />
            <div className="floating-orb floating-orb-3" />
            <div className="bg-grid-pattern absolute inset-0" />
          </div>

          {/* Main content */}
          <div className="relative z-10">{children}</div>

          {/* Toast notifications */}
          <Toaster position="bottom-right" richColors />
          <VersionGuard />

          {/* Footer with legal link */}
          <footer
            className="relative z-10 flex items-center justify-center gap-4 py-6 text-center text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            <Link
              href="/legal"
              className="transition-colors hover:text-violet-400"
            >
              Privacy & Legal
            </Link>
            <span style={{ color: "var(--text-tertiary)" }}>•</span>
            <a
              href="https://github.com/maxgfr/csv-ai-analyzer"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-violet-400"
            >
              GitHub
            </a>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
