import { ImageResponse } from "next/og";

export const runtime = "edge";
export const dynamic = "force-static";

export const alt = "CSV AI Analyzer - Analyze your data with AI";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0f172a",
          backgroundImage:
            "radial-gradient(circle at 25% 25%, #7c3aed33 0%, transparent 50%), radial-gradient(circle at 75% 75%, #06b6d433 0%, transparent 50%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              fontSize: 80,
              marginBottom: 20,
            }}
          >
            📊
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 60,
              fontWeight: 700,
              background: "linear-gradient(to right, #ffffff, #a5b4fc)",
              backgroundClip: "text",
              color: "transparent",
              marginBottom: 20,
            }}
          >
            CSV AI Analyzer
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 28,
              color: "#94a3b8",
              maxWidth: 800,
              textAlign: "center",
            }}
          >
            Analyze your CSV files with AI • Generate charts • Detect anomalies
          </div>

          {/* Features */}
          <div
            style={{
              display: "flex",
              gap: 24,
              marginTop: 40,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: "#1e293b",
                padding: "12px 20px",
                borderRadius: 12,
                color: "#a5b4fc",
                fontSize: 18,
              }}
            >
              🔒 100% Private
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: "#1e293b",
                padding: "12px 20px",
                borderRadius: 12,
                color: "#a5b4fc",
                fontSize: 18,
              }}
            >
              🤖 AI-Powered
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: "#1e293b",
                padding: "12px 20px",
                borderRadius: 12,
                color: "#a5b4fc",
                fontSize: 18,
              }}
            >
              📈 Smart Charts
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
