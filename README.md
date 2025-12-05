# 📊 CSV AI Analyzer

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://maxgfr.github.io/csv-ai-analyzer)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/maxgfr/csv-ai-analyzer)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-38bdf8.svg)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 🚀 **[Try it live →](https://maxgfr.github.io/csv-ai-analyzer)**

A modern, elegant application to analyze your CSV files with Artificial Intelligence. **100% private** - everything stays local in your browser.

## ✨ Features

### 📁 CSV Upload & Parsing
- **Drag & Drop** or file selection
- **Automatic detection** of delimiters (comma, semicolon, tab)
- **Configurable settings**: delimiter, header row, encoding
- **Type inference** for columns (text, number, date)

### 📋 Data Visualization
- **Interactive table** with sorting and pagination
- **Data preview** with automatic formatting
- **Smooth navigation** for large datasets

### 🤖 AI Chart Generation
- **Multi-provider support**: OpenAI (GPT-5 ready)
- **Intelligent analysis** of your data
- **Chart suggestions** tailored to your dataset
- **Chart types**: Bar, Line, Pie, Scatter, Area

### 🔒 Privacy
- **100% local**: no data sent to a server (processing in browser or direct to AI API)
- **API keys stored locally** in your browser
- **No tracking** or third-party cookies

## 🚀 Installation

```bash
# Clone the repo
git clone https://github.com/maxgfr/csv-ai-analyzer.git
cd csv-ai-analyzer

# Install dependencies
pnpm install

# Run in development
pnpm dev
```

The application will be accessible at [http://localhost:3000](http://localhost:3000)

Or use the **[live version](https://maxgfr.github.io/csv-ai-analyzer)** directly!

## 🎮 Usage

### 1. Upload a CSV
Drag and drop your CSV file or click to select a file.

### 2. Configure Parsing (Optional)
If automatic detection doesn't work perfectly, adjust the settings:
- Custom delimiter
- Header row choice
- File encoding

### 3. Configure your API Key
Click the ⚙️ icon to configure your AI provider:
- **OpenAI**: Key starting with `sk-`

### 4. Analysis & Charts
Click "Run Complete Analysis" and the AI will analyze your data, detect anomalies, and suggest relevant visualizations.

## 🛠️ Tech Stack

| Technology | Usage |
|-------------|-------|
| **Next.js 15** | React Framework with App Router |
| **TailwindCSS v4** | Styling and design system |
| **PapaParse** | Client-side CSV parsing |
| **Recharts** | React charting library |
| **Lucide React** | Modern icons |
| **js-cookie** | Secure local persistence |

## 📁 Project Structure

```
src/
├── app/
│   ├── _components/
│   │   ├── FileUpload.tsx      # CSV drop zone
│   │   ├── CSVSettings.tsx     # Parsing configuration
│   │   ├── DataTable.tsx       # Data table
│   │   ├── APIKeySettings.tsx  # API key config
│   │   ├── ChartSuggestions.tsx# AI Suggestions
│   │   └── ChartDisplay.tsx    # Chart rendering
│   ├── layout.tsx
│   └── page.tsx                # Main page
├── lib/
│   ├── csv-parser.ts           # Parsing utilities
│   ├── ai-service.ts           # AI API calls
│   └── storage.ts              # Storage utils
└── styles/
    └── globals.css             # Global styles
```

## 🎨 Design

The application uses a modern design with:
- **Dark mode** default
- **Glassmorphism** for components
- **Gradients** violet/cyan
- **Smooth animations** on interactions

## 📝 License

MIT - Use as you wish!
