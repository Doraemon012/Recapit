"use client";

import { useState, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type Props = {
  open: boolean;
  onClose: () => void;
  onUploaded?: (jobId: string) => void;
};

export default function UploadModal({ open, onClose, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

  const submit = async () => {
    if (!file) {
      setMessage("Please choose a file first");
      return;
    }
    setStatus("submitting");
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/v1/meetings/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        setStatus("error");
        setMessage(text || "Upload failed");
        return;
      }
      const data = await res.json();
      setStatus("done");
      setMessage("Upload queued");
      onUploaded?.(data.job_id);
    } catch (err) {
      setStatus("error");
      setMessage("Network error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Upload Meeting</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="mt-4">
          <input ref={fileRef} type="file" accept="audio/*" onChange={onFileChange} />
          <div className="mt-4 flex gap-2">
            <button onClick={() => fileRef.current?.click()} className="rounded bg-indigo-600 px-4 py-2 text-white">Choose file</button>
            <button onClick={submit} disabled={status === "submitting"} className="rounded border border-white/10 px-4 py-2 text-white">{status === "submitting" ? "Uploading..." : "Upload"}</button>
            <button onClick={onClose} className="rounded px-4 py-2 text-slate-200">Cancel</button>
          </div>
          {message ? <div className="mt-3 text-sm text-slate-300">{message}</div> : null}
        </div>
      </div>
    </div>
  );
}
