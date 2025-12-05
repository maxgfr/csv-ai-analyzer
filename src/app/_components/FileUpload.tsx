"use client";

import { useCallback, useState } from "react";
import { Upload, File, X, AlertCircle } from "lucide-react";

interface FileUploadProps {
  onFileLoaded: (content: string, fileName: string) => void;
  currentFileName?: string;
  onClear: () => void;
}

export function FileUpload({
  onFileLoaded,
  currentFileName,
  onClear,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        setError("Please upload a CSV file");
        return;
      }

      setError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileLoaded(content, file.name);
      };
      reader.onerror = () => {
        setError("Error reading file");
      };
      reader.readAsText(file);
    },
    [onFileLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  if (currentFileName) {
    return (
      <div className="glass-card p-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
              <File className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="font-medium text-white">{currentFileName}</p>
              <p className="text-sm text-gray-400">File loaded</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
            title="Remove file"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label
        className={`
          glass-card glass-card-hover cursor-pointer block p-8 text-center
          transition-all duration-300
          ${
            isDragging
              ? "ring-2 ring-violet-500 bg-violet-500/10"
              : ""
          }
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleInputChange}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-4">
          <div
            className={`
              p-4 rounded-2xl transition-all duration-300
              ${
                isDragging
                  ? "bg-violet-500/20 scale-110"
                  : "bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20"
              }
            `}
          >
            <Upload
              className={`w-8 h-8 ${isDragging ? "text-violet-400" : "text-violet-500"}`}
            />
          </div>
          <div>
            <p className="text-lg font-medium text-white mb-1">
              {isDragging ? "Drop your file here" : "Drag & drop your CSV file"}
            </p>
            <p className="text-sm text-gray-400">
              or click to browse files
            </p>
          </div>
        </div>
      </label>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/30 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
