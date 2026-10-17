"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadModal from "../components/UploadModal";
import Link from "next/link";
import type { MeetingJobStatus } from "../models/meeting";
import Navbar from "../components/Navbar";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function DashboardPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingJobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Check if user is authenticated
        const userRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
          credentials: "include",
        });

        if (!userRes.ok) {
          // Not authenticated, redirect to login
          router.push("/login");
          return;
        }

        const userData = await userRes.json();
        setUser(userData);

        // Load user's meetings
        const meetingsRes = await fetch(`${API_BASE}/api/v1/meetings/list`, {
          credentials: "include",
        });

        if (meetingsRes.ok) {
          const meetingsData = await meetingsRes.json();
          setMeetings(meetingsData);
        } else {
          setError("Failed to load meetings");
        }
      } catch (err) {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      router.push("/login");
    } catch (err) {
      console.error("Logout failed", err);
    }
  }

  function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return "Unknown";
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return "Invalid date";
    }
  }

  function getStatusColor(status: string): string {
    const s = status.toLowerCase();
    if (s === "completed") return "text-emerald-400 bg-emerald-500/10";
    if (s === "failed" || s === "error") return "text-rose-400 bg-rose-500/10";
    if (s === "processing") return "text-sky-400 bg-sky-500/10";
    return "text-slate-400 bg-slate-500/10";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Navbar */}
      <Navbar />
      
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.35),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_bottom,rgba(14,116,144,0.25),transparent_60%)]" />

      <div className="mx-auto w-full max-w-7xl px-6 pb-24 pt-10 sm:px-10 lg:px-16">
        {/* Header */}
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_50px_rgba(15,23,42,0.6)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-white">Dashboard</h1>
              {user && (
                <p className="mt-2 text-sm text-slate-300">
                  Welcome back, <span className="text-indigo-300">{user.email}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-medium text-white transition hover:from-indigo-400 hover:to-purple-400"
              >
                Upload New Meeting
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-rose-400/60 hover:text-rose-300"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Meetings List */}
        <main className="mt-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white">Your Meeting Recaps</h2>
            <span className="text-sm text-slate-400">
              {meetings.length} {meetings.length === 1 ? "meeting" : "meetings"}
            </span>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300">
              {error}
            </div>
          )}

          {meetings.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-12 text-center">
              <p className="text-lg text-slate-300">No meetings yet</p>
              <p className="mt-2 text-sm text-slate-400">
                Upload your first meeting recording to get started
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Upload Meeting
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {meetings.map((meeting) => (
                    <Link
                      key={meeting.job_id}
                      href={`/meetings/${meeting.job_id}`}
                      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-slate-900/70 to-slate-800/60 p-6 shadow-[0_25px_60px_rgba(2,6,23,0.7)] backdrop-blur-sm transition-all hover:scale-[1.01]"
                    >
                  <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.2),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />

                  <div className="mb-4 flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white line-clamp-2">
                      {meeting.filename}
                    </h3>
                    <span
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${getStatusColor(
                        meeting.status
                      )}`}
                    >
                      {meeting.status}
                    </span>
                  </div>

                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Created</span>
                      <span className="text-white">{formatDate(meeting.created_at)}</span>
                    </div>

                    {meeting.status.toLowerCase() === "completed" && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Status</span>
                        <span className="text-emerald-300">Ready to view</span>
                      </div>
                    )}

                    {meeting.status.toLowerCase() !== "completed" && (
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                          <span>Progress</span>
                          <span>{Math.round(meeting.progress_percent)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-linear-to-r from-indigo-500 to-sky-400 transition-all"
                            style={{ width: `${meeting.progress_percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex items-center justify-end">
                    <span className="text-xs font-medium text-indigo-300 transition group-hover:text-indigo-200">
                      View Details →
                    </span>
                  </div>
                    </Link>
              ))}
            </div>
          )}
        
        <UploadModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onUploaded={(jobId) => {
            setModalOpen(false);
            // redirect to meeting detail
            router.push(`/meetings/${jobId}`);
          }}
        />
        </main>
      </div>
    </div>
  );
}
