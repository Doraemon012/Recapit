"use client";

import { useCallback } from "react";

type SummaryDownloadButtonProps = {
  summary: string;
  filename: string;
  jobId: string;
};

export function SummaryDownloadButton({ summary, filename, jobId }: SummaryDownloadButtonProps) {
  const handleDownload = useCallback(() => {
    if (!summary) {
      return;
    }

    const safeBase = [filename, jobId]
      .map((value) => value.replace(/[^a-z0-9]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))
      .filter(Boolean)
      .join("-")
      .slice(0, 80) || "meeting-summary";

    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeBase}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filename, jobId, summary]);

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-indigo-300/60 hover:bg-indigo-500/25"
    >
      Download summary
    </button>
  );
}
