"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  type ComponentType,
  SVGProps,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import type { MeetingJobStatus, MeetingQueuedPayload } from "./models/meeting";

type UploadStatus = "idle" | "valid" | "error" | "submitted";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const TERMINAL_STATUSES = new Set(["completed", "failed", "error", "done", "succeeded"]);

const heroPills: Array<{ icon: IconComponent; label: string }> = [
  { icon: RecordingIcon, label: "Multi-speaker diarization" },
  { icon: ShieldCheckIcon, label: "Enterprise-grade security" },
  { icon: ZapIcon, label: "Native CRM, PM, and chat syncs" },
];

const heroSignalChips: Array<{ label: string; value: string }> = [
  { label: "Speaker ID", value: "Diarization synced" },
  { label: "LLM summary", value: "Drafting" },
  { label: "Actions", value: "3 detected" },
];

const featureCards: Array<{ icon: IconComponent; title: string; description: string }> = [
  {
    icon: DocumentSparkleIcon,
    title: "Context-aware narratives",
    description:
      "Summaries tuned for exec readouts, product standups, and customer success with tone presets.",
  },
  {
    icon: FlowIcon,
    title: "Automated workflows",
    description:
      "Sync action items to Slack, Jira, or Linear, and auto-create CRM follow-ups when owners are assigned.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Governance built-in",
    description:
      "Workspace isolation, SOC2-ready audit trails, and redaction policies keep compliance teams happy.",
  },
];

const workflowSteps: Array<{
  title: string;
  caption: string;
  duration: string;
  icon: IconComponent;
  subpoints?: string[];
}> = [
  {
    title: "Audio ingested",
    caption: "Drag & drop files or schedule auto-capture from Zoom, Meet, or Teams.",
    duration: "< 30 seconds",
    icon: RecordingIcon,
    subpoints: [
      "Normalize volume, trim silence, and detect language automatically.",
      "Hash recordings for dedupe and retention compliance.",
    ],
  },
  {
    title: "AI pipeline orchestrated",
    caption:
      "Speech-to-text, speaker labeling, summarization, and structured extraction chain without manual prompts.",
    duration: "~ 90 seconds",
    icon: SparkIcon,
    subpoints: [
      "Cascade diarization → summarization → action extraction with guardrails.",
      "Swap models per workspace: Whisper, Deepgram, or custom.",
      "Apply topic modeling and sentiment scoring in parallel streams.",
    ],
  },
  {
    title: "Insights delivered",
    caption:
      "Review transcripts, approve summaries, and push decisions straight into the tools your team already uses.",
    duration: "Real-time",
    icon: DocumentSparkleIcon,
    subpoints: [
      "Publish recap packets, Slack briefs, and CRM notes automatically.",
      "Track ownership and due dates with reminder cadences.",
    ],
  },
  {
    title: "Observability & feedback",
    caption:
      "Govern the pipeline with full audit logs, human-in-loop overrides, and quality metrics that improve every run.",
    duration: "Continuous",
    icon: ShieldCheckIcon,
    subpoints: [
      "Monitor latency, transcription accuracy, and LLM hallucination risk dashboards.",
      "Invite reviewers to fine-tune prompts and escalate edge cases.",
    ],
  },
];

const summaryHighlights: Array<{ label: string; description: string; accent: string }> = [
  {
    label: "Decision",
    description: "Greenlight the RevOps pilot with enterprise accounts in Q1.",
    accent: "text-emerald-300",
  },
  {
    label: "Action",
    description: "Maya to circulate the updated SOC2 brief before Tuesday standup.",
    accent: "text-sky-300",
  },
  {
    label: "Risk",
    description: "Need clarity on legal review backlog ahead of the renewal cycle.",
    accent: "text-rose-300",
  },
];

const integrationChips = ["Zoom", "Google Meet", "Microsoft Teams", "Slack", "Salesforce", "Linear"];

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [jobStatus, setJobStatus] = useState<MeetingJobStatus | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);

  const statusMessage = useMemo(() => {
    if (status === "valid" && selectedFile) {
      return `${selectedFile.name} is ready to be sent to the pipeline.`;
    }
    if (status === "submitted") {
      if (jobStatus) {
        const progressLabel = `${Math.round(jobStatus.progress_percent ?? 0)}%`;
        return `Monitoring job ${jobStatus.job_id} — ${jobStatus.status} (${progressLabel}).`;
      }
      return "Upload accepted. Monitoring job progress...";
    }
    if (status === "error") {
      return "Something went wrong. Please choose an audio file and try again.";
    }
    return "Drop a recording or browse your files to get started.";
  }, [jobStatus, selectedFile, status]);

  const handleFile = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      setStatus("error");
      return;
    }

    setJobStatus(null);
    setPollingError(null);
    setSelectedFile(file);
    setStatus("valid");
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    handleFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const triggerFileDialog = () => {
    fileInputRef.current?.click();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setStatus("error");
      setPollingError("You must be logged in to upload and transcribe. Please log in or sign up.");
      return;
    }
    if (!selectedFile) {
      setStatus("error");
      return;
    }
    // send file to backend
    setStatus("submitted");

    const send = async () => {
      try {
        const fd = new FormData();
        fd.append("file", selectedFile as File);

        console.info("Uploading file to backend", selectedFile.name);

        const res = await fetch("http://localhost:8000/api/v1/meetings/upload", {
          method: "POST",
          body: fd,
          credentials: "include",
        });

        if (!res.ok) {
          console.error("Upload failed", res.status, await res.text());
          setStatus("error");
          return;
        }

        const data = await res.json();
        console.info("Upload response", data);
        const queued = data as MeetingQueuedPayload;
        setJobStatus({
          job_id: queued.job_id,
          filename: queued.filename,
          content_type: queued.content_type,
          status: queued.status,
          created_at: queued.created_at,
          progress_percent: Math.max(0, Math.min(100, queued.progress_percent ?? 0)),
          status_message: queued.status_message ?? "Queued for processing",
        });
        setPollingError(null);
        setStatus("submitted");
      } catch (err) {
        console.error("Upload error", err);
        setStatus("error");
        setJobStatus(null);
      }
    };

    void send();
  };

  useEffect(() => {
    // check authentication for homepage upload
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}/api/v1/auth/me`, {
          credentials: "include",
        });
        if (!mounted) return;
        setIsAuthenticated(res.ok);
      } catch (err) {
        if (!mounted) return;
        setIsAuthenticated(false);
      }
    })();

    if (!jobStatus) {
      return;
    }

    const jobId = jobStatus.job_id;
    if (!jobId) {
      return;
    }

    const lowerStatus = jobStatus.status.toLowerCase();
    if (TERMINAL_STATUSES.has(lowerStatus)) {
      return;
    }

    let isActive = true;
    let intervalId: NodeJS.Timeout | undefined;

    const poll = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/v1/meetings/status/${jobId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || `Status request failed with ${res.status}`);
        }

        const data = (await res.json()) as MeetingJobStatus;
        if (!isActive) {
          return;
        }

        const nextStatus: MeetingJobStatus = {
          ...data,
          progress_percent: Math.max(0, Math.min(100, data.progress_percent ?? 0)),
          status_message: data.status_message ?? jobStatus.status_message ?? null,
        };

        setJobStatus(nextStatus);
        setPollingError(null);

        if (TERMINAL_STATUSES.has(nextStatus.status.toLowerCase())) {
          if (intervalId) {
            clearInterval(intervalId);
          }
        }
      } catch (error) {
        console.error("Status polling error", error);
        if (!isActive) {
          return;
        }
        setPollingError("Trouble refreshing status. Retrying...");
      }
    };

    void poll();
    intervalId = setInterval(poll, 2500);

    return () => {
      isActive = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [jobStatus?.job_id, jobStatus?.status, jobStatus?.status_message]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.35),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_bottom,rgba(14,116,144,0.25),transparent_60%)]" />

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-16 px-6 pb-24 pt-10 sm:px-10 lg:px-16">
        <nav className="flex flex-col gap-4 rounded-full border border-white/10 bg-white/5 px-6 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-tr from-indigo-500 via-purple-500 to-sky-400 text-base font-semibold text-white shadow-[0_0_25px_rgba(99,102,241,0.35)]">
              R
            </span>
            <div className="flex items-center gap-3 text-sm text-slate-200">
              <span className="font-semibold uppercase tracking-[0.25em] text-slate-300">Recapit</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200">
                Beta Access
              </span>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a className="transition hover:text-white" href="#features">
              Features
            </a>
            <a className="transition hover:text-white" href="#workflow">
              Workflow
            </a>
            <a className="transition hover:text-white" href="#integrations">
              Integrations
            </a>
            <Link className="transition hover:text-white" href="/dashboard">
              Dashboard
            </Link>
            <Link className="transition hover:text-white" href="/dashboard">
              Account
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/40 hover:text-white"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/40 hover:text-white"
            >
              Sign Up
            </Link>
          </div>
        </nav>
    <header className="relative overflow-hidden rounded-[40px] border border-white/10 bg-slate-900/70 px-8 py-12 backdrop-blur lg:px-14">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(99,102,241,0.4),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(56,189,248,0.35),transparent_60%)]" />
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-indigo-200">
                <SparkleBurstIcon className="h-4 w-4 text-indigo-300" />
                AI Meeting Summarizer
              </div>
              <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                One recording. Enterprise intelligence on every decision.
              </h1>
              <p className="text-lg text-slate-200 sm:text-xl">
                Recapit transforms unscripted conversations into crystal-clear transcripts, narrative
                summaries, action plans, and system updates—automatically, securely, and in minutes.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={triggerFileDialog}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-[0_12px_40px_rgba(255,255,255,0.25)] transition hover:bg-slate-100"
                >
                  Launch summarizer
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white"
                >
                  <PlayIcon className="h-4 w-4" /> Watch 90s tour
                </button>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-300/80">
                {heroPills.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1"
                  >
                    <Icon className="h-4 w-4 text-indigo-300" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative mt-6 flex w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-200 shadow-[0_20px_45px_rgba(15,23,42,0.45)] sm:self-end lg:mt-0">
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.25),transparent_60%)]" />
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_bottom,rgba(14,116,144,0.2),transparent_65%)]" />
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.3em] text-indigo-200">Live pipeline</span>
                <SparkIcon className="h-5 w-5 text-indigo-300" />
              </div>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Waveform</p>
                  <WaveformIcon className="mt-3 h-16 w-full text-indigo-300" />
                  <p className="mt-2 text-xs text-slate-400">Real-time speaker separation</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Pipeline status</p>
                  <ul className="mt-3 space-y-3">
                    {heroSignalChips.map((chip) => (
                      <li key={chip.label} className="flex items-center justify-between text-xs text-slate-200">
                        <span className="font-medium text-white/80">{chip.label}</span>
                        <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold text-indigo-200">
                          {chip.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-col gap-10">
          <section className="grid gap-8 lg:grid-cols-2">
            <form
              onSubmit={onSubmit}
              className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 p-12 shadow-[0_25px_65px_rgba(15,23,42,0.55)]"
            >
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[conic-gradient(from_180deg_at_50%_0%,rgba(99,102,241,0.45),transparent_60%)]" />
              <div className="pointer-events-none absolute inset-x-6 top-8 -z-10 h-48 rounded-3xl bg-linear-to-br from-indigo-500/60 via-sky-500/40 to-transparent blur-3xl" />
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">Upload a meeting recording</h2>
              <p className="mt-3 max-w-xl text-sm text-slate-300">
                High fidelity audio with optional multi-track feeds. Everything is encrypted in
                transit and stored only for the duration of processing unless you opt in to history.
              </p>

              {isAuthenticated === false ? (
                <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-200">
                  Please <a href="/login" className="underline text-amber-100">log in</a> or <a href="/signup" className="underline text-amber-100">sign up</a> to upload and transcribe meetings.
                </div>
              ) : null}

              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className={`mt-9 flex cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed p-10 text-center transition focus:outline-none focus:ring-2 focus:ring-indigo-400/60 lg:p-14 ${
                  isDragging
                    ? "border-indigo-300 bg-indigo-500/10"
                    : "border-white/15 bg-white/5 hover:border-indigo-300"
                }`}
                role="button"
                tabIndex={0}
                onClick={triggerFileDialog}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    triggerFileDialog();
                  }
                }}
              >
                <CloudArrowUpIcon className="h-12 w-12 text-indigo-300" />
                <div className="space-y-1">
                  <p className="text-lg font-medium text-white">Drag & drop or click to browse</p>
                  <p className="text-sm text-slate-300">Up to 2GB • MP3, WAV, AAC, FLAC, M4A supported</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={onFileInputChange}
                />
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm">
                <p
                  className={`text-sm ${
                    status === "error"
                      ? "text-rose-300"
                      : status === "submitted"
                        ? "text-emerald-300"
                        : "text-slate-300"
                  }`}
                >
                  {statusMessage}
                </p>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-indigo-500 to-purple-500 px-6 py-2 text-sm font-semibold text-white transition hover:from-indigo-400 hover:to-purple-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/80 focus:ring-offset-2 focus:ring-offset-slate-950"
                >
                  Send to pipeline
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              </div>

              {jobStatus ? (
                <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-xs text-slate-200">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-indigo-200">Active job</p>
                  <div className="space-y-1">
                    <p className="font-medium text-white">
                      Job ID: <span className="font-mono text-sm text-indigo-200">{jobStatus.job_id}</span>
                    </p>
                    <p className="text-slate-300">File: {jobStatus.filename}</p>
                    <p className="text-xs uppercase tracking-[0.3em] text-indigo-200">Status: {jobStatus.status}</p>
                    <p className="text-xs text-slate-400">
                      Created at: {new Date(jobStatus.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Pipeline progress</span>
                      <span>{Math.round(Math.max(0, Math.min(100, jobStatus.progress_percent)))}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-indigo-500 to-sky-400 transition-all duration-500"
                        style={{ width: `${Math.max(0, Math.min(100, jobStatus.progress_percent))}%` }}
                      />
                    </div>
                  </div>
                  {jobStatus.status_message ? (
                    <p className="text-[11px] text-slate-300/90">{jobStatus.status_message}</p>
                  ) : null}
                  {pollingError ? <p className="text-[11px] text-amber-300">{pollingError}</p> : null}
                  <Link
                    href={`/meetings/${jobStatus.job_id}`}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-indigo-400/60 bg-indigo-500/20 px-5 py-2 text-sm font-semibold text-indigo-200 transition hover:border-indigo-300 hover:bg-indigo-500/30"
                  >
                    Go to Recap
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              ) : null}
            </form>

            <div
              id="insights"
              className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-linear-to-br from-indigo-500/20 via-slate-900 to-slate-900 p-8 shadow-[0_25px_65px_rgba(15,23,42,0.55)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-indigo-200">AI summary preview</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Monday Leadership Sync</h3>
                </div>
                <WaveformIcon className="h-12 w-12 text-indigo-300" />
              </div>
              <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
                {jobStatus ? (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-indigo-200">Pipeline update</p>
                    <p className="mt-2 leading-relaxed text-slate-100">
                      {jobStatus.status_message ?? "Working on your meeting recap."}
                    </p>
                    <p className="mt-3 text-xs text-slate-300/80">
                      Processing your meeting... Check the upload card for the "Go to Recap" button once ready.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-white">"Revenue pilot clears compliance review pending security brief."</p>
                    <p className="text-xs uppercase tracking-[0.3em] text-indigo-200">Confidence: 98%</p>
                  </>
                )}
              </div>
              <ul className="mt-6 space-y-4 text-sm">
                {summaryHighlights.map((item) => (
                  <li key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${item.accent}`}>
                      {item.label}
                    </p>
                    <p className="mt-2 text-slate-200">{item.description}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-indigo-200" />
                  Generated in 112 seconds
                </span>
                <span className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-indigo-200" />
                  Synced to Slack + Salesforce
                </span>
              </div>
            </div>
          </section>

          <section
            id="workflow"
            className="rounded-3xl border border-slate-800 bg-slate-900/70 p-10"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">Orchestrated pipeline</h3>
                <p className="mt-2 text-sm text-slate-300">
                  Every stage is observable and auditable. Swap models or insert human review gates per workflow.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                  <SparkIcon className="h-4 w-4 text-indigo-300" />
                  Auto escalation
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                  <ShieldCheckIcon className="h-4 w-4 text-emerald-300" />
                  Guardrails
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                  <ClockIcon className="h-4 w-4 text-indigo-200" />
                  Avg latency 118s
                </span>
              </div>
            </div>
            <div className="relative mt-10">
              <div className="pointer-events-none absolute left-12 top-12 bottom-12 -z-10 w-px bg-linear-to-b from-indigo-400/80 via-sky-400/60 to-transparent lg:hidden" />
              <div className="pointer-events-none absolute hidden -z-10 h-px bg-linear-to-r from-indigo-400/80 via-sky-400/60 to-transparent lg:block lg:left-16 lg:right-16 lg:top-12" />
              <div className="flex flex-col gap-12 lg:flex-row lg:items-stretch lg:gap-6">
                {workflowSteps.map((step, index) => (
                  <div key={step.title} className="relative lg:flex-1">
                    {index > 0 && (
                      <span className="pointer-events-none absolute -left-6 top-12 hidden h-px w-6 bg-linear-to-l from-sky-400/60 via-indigo-400/80 to-transparent lg:block" />
                    )}
                    {index < workflowSteps.length - 1 && (
                      <>
                        <span className="pointer-events-none absolute -right-6 top-12 hidden h-px w-6 bg-linear-to-r from-sky-400/60 via-indigo-400/80 to-transparent lg:block" />
                        <span className="pointer-events-none absolute left-9 -bottom-12 block h-12 w-px bg-linear-to-b from-indigo-400/80 via-sky-400/60 to-transparent lg:hidden" />
                      </>
                    )}
                    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 pt-16 shadow-[0_20px_45px_rgba(15,23,42,0.4)]">
                      <step.icon className="absolute left-6 top-6 h-6 w-6 text-indigo-300" />
                      <div className="space-y-2">
                        <p className="text-base font-medium text-white">{step.title}</p>
                        <p className="text-sm text-slate-300">{step.caption}</p>
                      </div>
                      {step.subpoints && (
                        <ul className="mt-4 space-y-2 text-sm text-slate-300/90">
                          {step.subpoints.map((point) => (
                            <li key={point} className="flex items-start gap-2">
                              <span className="mt-1 inline-flex h-1.5 w-1.5 flex-none rounded-full bg-indigo-400" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <span className="mt-6 inline-flex rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                        {step.duration}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        <section
          id="features"
          className="grid gap-6 rounded-4xl border border-slate-800 bg-slate-900/70 p-10"
        >
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.3em] text-indigo-200">Why teams switch</span>
            <h2 className="text-3xl font-semibold text-white">Designed for revenue, product, and customer leaders</h2>
            <p className="text-sm text-slate-300">
              The Recapit platform unifies meeting knowledge, decisions, and next steps across
              timezones and tools—no more digging through recordings or fragmented notes.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {featureCards.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-indigo-300/60 hover:bg-indigo-500/10"
              >
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.2),transparent_60%)] opacity-0 transition group-hover:opacity-100" />
                <Icon className="h-6 w-6 text-indigo-300" />
                <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm text-slate-200">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="integrations"
          className="flex flex-col gap-6 rounded-4xl border border-slate-800 bg-slate-900/70 p-10"
        >
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.3em] text-indigo-200">Integrations</span>
            <h2 className="text-2xl font-semibold text-white">Connect your meeting stack in minutes</h2>
            <p className="text-sm text-slate-300">
              Recapit plugs into conferencing platforms, CRMs, PM tools, and chat hubs so insights
              flow where work happens.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {integrationChips.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-200"
              >
                <LinkIcon className="h-4 w-4 text-indigo-200" />
                {label}
              </span>
            ))}
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 text-sm text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} Recapit Labs. All rights reserved.</p>
          <div className="flex flex-wrap gap-4">
            <a className="transition hover:text-slate-200" href="#">
              Privacy
            </a>
            <a className="transition hover:text-slate-200" href="#">
              Security
            </a>
            <a className="transition hover:text-slate-200" href="#">
              Status
            </a>
            <a className="transition hover:text-slate-200" href="#">
              Changelog
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

function CloudArrowUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M7 17h10a4 4 0 0 0 .74-7.927A5.5 5.5 0 0 0 6.062 9.71 3.5 3.5 0 0 0 7 17Zm5-4.5V7m0 0L9.5 9.5M12 7l2.5 2.5"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M5 12h14m0 0-4.5-4.5M19 12l-4.5 4.5"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M8.5 6.5v11l9-5.5-9-5.5Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RecordingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x={9} y={4} width={6} height={12} rx={3} stroke="currentColor" strokeWidth={1.5} />
      <path
        d="M6 11.5v1a6 6 0 0 0 12 0v-1m-6 9V20"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M12 3 5 6v5c0 5.25 3.75 8.25 7 9 3.25-.75 7-3.75 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ZapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="m6 13 7-10-1 8h6l-7 10 1-8H6Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentSparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5-6Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M14 3v6h6" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <path
        d="M9 13h6M9 17h4"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M9.5 7.5 10 9l1.5.5L10 10 9.5 11.5 9 10 7.5 9.5 9 9 9.5 7.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FlowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x={4} y={4} width={6} height={6} rx={2} stroke="currentColor" strokeWidth={1.5} />
      <rect x={14} y={14} width={6} height={6} rx={2} stroke="currentColor" strokeWidth={1.5} />
      <rect x={14} y={4} width={6} height={6} rx={2} stroke="currentColor" strokeWidth={1.5} />
      <path d="M10 7h2.5A3.5 3.5 0 0 1 16 10.5V14" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M10 7v3.5A3.5 3.5 0 0 0 13.5 14H16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function WaveformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M4 18v-4m4 6V12m4 8V10m4 14V8m4 12V12m4 8V14m4 6v-4"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M10 2.5 11.6 7l4.4 1.6L11.6 10 10 14.5 8.4 10l-4.4-1.4L8.4 7 10 2.5Z" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

function SparkleBurstIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M10 1.5v4m0 9v4m8.5-8.5h-4m-9 0h-4M15 5l-2.5 2.5M7.5 12.5 5 15m0-10 2.5 2.5m5 5L15 15" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
        stroke="currentColor"
        strokeWidth={1.4}
      />
      <path d="M10 5.5v4.2l2.5 1.3" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M8.5 12.5 7 14a3 3 0 0 1-4.24-4.24l2-2A3 3 0 0 1 8 7h1.5"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 7.5 13 6a3 3 0 0 1 4.24 4.24l-2 2A3 3 0 0 1 12 13h-1.5"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
