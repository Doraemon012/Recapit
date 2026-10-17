"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";

import { SummaryDownloadButton } from "@/app/components/SummaryDownloadButton";
import { AnalyticsDashboard } from "@/app/components/analytics/AnalyticsDashboard";
import { AudioPlayer, type AudioPlayerRef } from "@/app/components/AudioPlayer";
import { WaveformVisualizer } from "@/app/components/WaveformVisualizer";
import { InteractiveTranscript } from "@/app/components/InteractiveTranscript";
import type { MeetingJobStatus } from "@/app/models/meeting";
import Navbar from "@/app/components/Navbar";

import { SidebarLink } from "../../components/SidebarLink";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const TERMINAL_STATUSES = new Set(["completed", "failed", "error", "done", "succeeded"]);

// Insights removed per UX request

const ACTION_ITEMS: Array<{
	title: string;
	owner: string;
	due: string;
	status: "Pending" | "In progress" | "Done";
}> = [
	{
		title: "Share SOC2 control matrix updates with RevOps leadership",
		owner: "Maya Patel",
		due: "Tue, Nov 12",
		status: "Pending",
	},
	{
		title: "Confirm pilot success metrics with Enterprise CS team",
		owner: "Jordan Blake",
		due: "Thu, Nov 14",
		status: "In progress",
	},
	{
		title: "Prepare enablement brief for rollout announcement",
		owner: "Sofia Ramirez",
		due: "Mon, Nov 18",
		status: "Pending",
	},
];

const PARTICIPANTS: Array<{
	name: string;
	role: string;
	speakingShare: number;
}> = [
	{ name: "Maya Patel", role: "CRO", speakingShare: 26 },
	{ name: "Jordan Blake", role: "Head of RevOps", speakingShare: 22 },
	{ name: "Andre Thomas", role: "Product", speakingShare: 18 },
	{ name: "Sofia Ramirez", role: "Marketing", speakingShare: 14 },
];

// Resources removed per UX request

const TIMELINE: Array<{ time: string; headline: string; description: string }> =
	[
		{
			time: "00:03",
			headline: "Kickoff",
			description:
				"Reviewed pilot objectives and decision checkpoints for the quarter.",
		},
		{
			time: "00:17",
			headline: "Security review",
			description:
				"Discussed SOC2 controls, highlighted remaining evidence needed before launch.",
		},
		{
			time: "00:31",
			headline: "Revenue impact",
			description:
				"RevOps shared early conversion lift signals and customer sentiment clips.",
		},
		{
			time: "00:46",
			headline: "Enablement plan",
			description:
				"Marketing to craft announcement assets, CS to prep onboarding guides.",
		},
	];

async function fetchMeeting(jobId: string): Promise<MeetingJobStatus> {
	const res = await fetch(`${API_BASE}/api/v1/meetings/${jobId}`, {
		cache: "no-store",
	});

	if (res.status === 404) {
		notFound();
	}

	if (!res.ok) {
		throw new Error(`Failed to load meeting ${jobId}: ${res.status}`);
	}

	const payload = (await res.json()) as MeetingJobStatus;
	return payload;
}

function formatDate(value: string | null | undefined) {
	if (!value) {
		return null;
	}
	const dt = new Date(value);
	if (Number.isNaN(dt.getTime())) {
		return null;
	}
	return new Intl.DateTimeFormat("en", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(dt);
}

function formatTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}
	return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function statusAccent(status: string) {
	const normalized = status.toLowerCase();
	if (normalized === "completed") {
		return "bg-emerald-500/15 text-emerald-300 border-emerald-400/40";
	}
	if (normalized === "failed" || normalized === "error") {
		return "bg-rose-500/15 text-rose-300 border-rose-400/40";
	}
	return "bg-indigo-500/15 text-indigo-200 border-indigo-400/40";
}

export default function MeetingRecapPage() {
	const params = useParams();
	const jobIdParam = params?.jobId as string | undefined;
	
	const [meeting, setMeeting] = useState<MeetingJobStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	
	// Audio player state
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [audioUrl, setAudioUrl] = useState<string | null>(null);
	const audioPlayerRef = useRef<AudioPlayerRef | null>(null);

	useEffect(() => {
		if (!jobIdParam || jobIdParam === "undefined") {
			notFound();
			return;
		}

		let isActive = true;
		let intervalId: NodeJS.Timeout | undefined;

		const fetchMeeting = async () => {
			try {
				const res = await fetch(`${API_BASE}/api/v1/meetings/${jobIdParam}`, {
					cache: "no-store",
					credentials: "include",
				});

				if (res.status === 404) {
					notFound();
					return;
				}

				if (!res.ok) {
					throw new Error(`Failed to load meeting ${jobIdParam}: ${res.status}`);
				}

				const data = (await res.json()) as MeetingJobStatus;
				if (!isActive) return;

				setMeeting(data);
				setLoading(false);

				// Stop polling if completed
				const lowerStatus = data.status.toLowerCase();
				if (TERMINAL_STATUSES.has(lowerStatus)) {
					if (intervalId) {
						clearInterval(intervalId);
					}
					console.log(`Meeting ${jobIdParam} completed, stopped polling`);
				}
			} catch (err) {
				if (!isActive) return;
				console.error("Failed to fetch meeting", err);
				setError(err instanceof Error ? err.message : "Failed to load meeting");
				setLoading(false);
			}
		};

		// Initial fetch
		void fetchMeeting();

		// Poll every 2.5 seconds if not completed
		intervalId = setInterval(() => {
			if (meeting && TERMINAL_STATUSES.has(meeting.status.toLowerCase())) {
				if (intervalId) clearInterval(intervalId);
				return;
			}
			void fetchMeeting();
		}, 2500);

		return () => {
			isActive = false;
			if (intervalId) clearInterval(intervalId);
		};
	}, [jobIdParam, meeting?.status]);

	// Set up audio URL when meeting data is available
	useEffect(() => {
		if (meeting && meeting.status === "completed") {
			const audioTestUrl = `${API_BASE}/api/v1/meetings/${meeting.job_id}/audio`;
			// Test if audio is available before setting URL
			fetch(audioTestUrl, { method: 'HEAD' })
				.then(response => {
					if (response.ok) {
						setAudioUrl(audioTestUrl);
					} else {
						console.warn('Audio file not available for this meeting');
						setAudioUrl(null);
					}
				})
				.catch(() => {
					console.warn('Audio file not accessible');
					setAudioUrl(null);
				});
		} else {
			setAudioUrl(null);
		}
	}, [meeting]);

	// Audio seek functionality
	const handleSeekToTime = (time: number) => {
		if (audioPlayerRef.current) {
			audioPlayerRef.current.seekTo(time);
		}
	};

	if (loading || !meeting) {
		return (
			<div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
					<p className="text-slate-300">Loading meeting...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 flex items-center justify-center">
				<div className="text-center">
					<p className="text-rose-400 mb-4">{error}</p>
					<Link href="/" className="text-indigo-400 hover:text-indigo-300">← Back to home</Link>
				</div>
			</div>
		);
	}

	const createdLabel = formatDate(meeting.created_at);
	const updatedLabel = formatDate(meeting.updated_at ?? null);
	const completedLabel = formatDate(meeting.completed_at ?? null);
	const clampedProgress = Math.max(
		0,
		Math.min(100, meeting.progress_percent ?? 0)
	);

	return (
		<div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
							{/* Navbar */}
							<Navbar />
							
							{/* Backgrounds */}
							<div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.35),transparent_55%)]" />
							<div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_bottom,rgba(14,116,144,0.25),transparent_60%)]" />

							{/* Main Wrapper */}
							<div className="mx-auto w-full max-w-[1600px] px-6 pb-16 pt-10 sm:px-10 lg:px-16">
								<div className="relative flex justify-center">
									{/* Fixed Sidebar */}
									<aside
										className="hidden lg:block fixed top-28 w-48 h-[calc(100vh-10rem)] overflow-y-auto"
										style={{ left: "calc(50% - 636px)" }}
									>
										<nav className="flex flex-col gap-4">
											<div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-xs text-slate-300 shadow-lg backdrop-blur-sm">
												<p className="font-semibold uppercase tracking-[0.3em] text-indigo-200">
													Meeting atlas
												</p>
												<p className="mt-3 text-slate-300/80">
													Jump to any section of the recap without
													losing your place.
												</p>
											</div>
											<div className="flex flex-col gap-3 mt-4">
												<SidebarLink
													href="#summary"
													label="Summary"
													icon="document"
												/>
												<SidebarLink
													href="#audio"
													label="Audio Player"
													icon="wave"
												/>
												<SidebarLink
													href="#transcript"
													label="Transcript"
													icon="document"
												/>
												<SidebarLink
													href="#analytics"
													label="Analytics"
													icon="spark"
												/>
												<SidebarLink
													href="#actions"
													label="Actions"
													icon="check"
												/>
												<SidebarLink
													href="#timeline"
													label="Timeline"
													icon="clock"
												/>
											</div>
										</nav>
									</aside>

								{/* Main Content */}
								<div className="flex min-w-0 flex-1 flex-col gap-10 lg:ml-80 lg:max-w-6xl">
										<header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_50px_rgba(15,23,42,0.6)] backdrop-blur-sm">
											<div className="flex flex-wrap items-center justify-between gap-4">
												<Link
													href="/"
													className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
												>
													← Back to uploader
												</Link>
												<span
													className={`inline-flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${statusAccent(
														meeting.status
													)}`}
												>
													{meeting.status}
												</span>
											</div>
											<div className="space-y-3">
												<h1 className="text-3xl font-semibold text-white sm:text-4xl">
													Meeting recap
												</h1>
												<p className="font-mono text-sm text-indigo-200">
													Job ID · {meeting.job_id}
												</p>
												<p className="text-sm text-slate-300">
													{meeting.filename}
												</p>
											</div>
											<div className="grid gap-4 text-xs text-slate-300 sm:grid-cols-3">
												<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
													<p className="text-[11px] uppercase tracking-[0.3em] text-indigo-200">
														Created
													</p>
													<p className="mt-2 text-sm text-white">
														{createdLabel ?? "Unknown"}
													</p>
												</div>
												<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
													<p className="text-[11px] uppercase tracking-[0.3em] text-indigo-200">
														Last update
													</p>
													<p className="mt-2 text-sm text-white">
														{updatedLabel ?? "Processing"}
													</p>
												</div>
												<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
													<p className="text-[11px] uppercase tracking-[0.3em] text-indigo-200">
														Completed
													</p>
													<p className="mt-2 text-sm text-white">
														{completedLabel ?? "Pending"}
													</p>
												</div>
											</div>
											<div>
												<div className="flex items-center justify-between text-xs text-slate-300">
													<span>Pipeline progress</span>
													<span>{Math.round(clampedProgress)}%</span>
												</div>
												<div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
													<div
														className="h-full rounded-full bg-linear-to-r from-indigo-500 to-sky-400"
														style={{ width: `${clampedProgress}%` }}
													/>
												</div>
												{meeting.status_message ? (
													<p className="mt-2 text-xs text-slate-400">
														{meeting.status_message}
													</p>
												) : null}
											</div>
										</header>

										{/* Audio Player Section */}
										{meeting.status === "completed" && (
											<section id="audio" className="space-y-4">
												{audioUrl ? (
													<>
														<AudioPlayer
															ref={audioPlayerRef}
															audioUrl={audioUrl}
															onTimeUpdate={setCurrentTime}
															onDurationChange={setDuration}
															className="w-full"
														/>
														<WaveformVisualizer
															audioUrl={audioUrl}
															currentTime={currentTime}
															duration={duration}
															onSeek={handleSeekToTime}
															className="w-full"
														/>
													</>
												) : (
													<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
														<div className="flex items-center gap-3 mb-3">
															<div className="rounded-xl bg-amber-500/20 p-2.5 shadow-lg">
																<svg className="h-5 w-5 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
																	<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9 9v6a3 3 0 003 3h4M9 9a3 3 0 013-3h4m-7 3v6" />
																</svg>
															</div>
															<div>
																<p className="text-xs uppercase tracking-[0.3em] text-amber-200">
																	Audio Playback
																</p>
																<h3 className="mt-1 text-lg font-semibold text-white">
																	Audio Not Available
																</h3>
															</div>
														</div>
														<p className="text-amber-200/80 text-sm">
															The original audio file is not available for this meeting. This may be because the file was processed before audio storage was enabled, or there was an issue saving the audio file during upload.
														</p>
													</div>
												)}
											</section>
										)}

										<main className="flex flex-col gap-8">
											{/* 1. Executive Summary */}
											<section
												id="summary"
												className="space-y-6 rounded-3xl border border-indigo-500/30 bg-linear-to-br from-indigo-500/20 via-slate-900/90 to-slate-900 p-8 lg:p-10 shadow-[0_25px_65px_rgba(15,23,42,0.55)] backdrop-blur-sm"
											>
												<div className="flex items-center justify-between gap-4">
													<div className="flex items-center gap-3">
														<div className="rounded-xl bg-indigo-500/20 p-2.5 shadow-lg">
															<svg className="h-5 w-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
																<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
															</svg>
														</div>
														<div>
															<p className="text-xs uppercase tracking-[0.3em] text-indigo-200">
																Executive summary
															</p>
															<h2 className="mt-1 text-xl font-semibold text-white">
																Highlights & Decisions
															</h2>
														</div>
													</div>
													{meeting.summary ? (
														<SummaryDownloadButton
															summary={meeting.summary}
															filename={meeting.filename}
															jobId={meeting.job_id}
														/>
													) : null}
												</div>

												{meeting.summary ? (
													<div className="space-y-4 text-base leading-relaxed text-slate-200 max-w-4xl">
														{meeting.summary
															.split("\n")
															.map((paragraph, index) => (
																<p
																	key={`${index}-${paragraph.slice(
																		0,
																		12
																	)}`}
																	className="text-slate-200/90"
																>
																	{paragraph}
																</p>
															))}
													</div>
												) : (
													<div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-slate-300">
														Summary is being generated. Check back
														once the pipeline reaches completion.
													</div>
												)}
											</section>

											{/* 2. Interactive Transcript Section */}
											<section
												id="transcript"
												className="space-y-5 rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_55px_rgba(15,23,42,0.45)] backdrop-blur-sm"
											>
												{meeting.transcript_segments && meeting.transcript_segments.length > 0 ? (
													<InteractiveTranscript
														segments={meeting.transcript_segments}
														currentTime={currentTime}
														onSeekToTime={handleSeekToTime}
													/>
												) : (
													<>
														<div className="flex items-center gap-3">
															<div className="rounded-xl bg-sky-500/20 p-2.5 shadow-lg">
																<svg className="h-5 w-5 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
																	<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
																</svg>
															</div>
															<div>
																<p className="text-xs uppercase tracking-[0.3em] text-indigo-200">
																	Transcript
																</p>
																<h2 className="mt-1 text-xl font-semibold text-white">
																	Conversation log
																</h2>
															</div>
														</div>
														<div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-slate-300">
															Transcript is not available yet. The ASR stage may still be running or the audio had insufficient content.
														</div>
													</>
												)}
												<div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-xs text-slate-300">
													<p className="text-[11px] uppercase tracking-[0.3em] text-indigo-200 mb-4">
														Raw metadata
													</p>
													<ul className="space-y-3">
														<li className="flex items-center justify-between gap-4 pb-3 border-b border-white/10">
															<span>Content type</span>
															<span className="font-mono text-slate-200/90">
																{meeting.content_type}
															</span>
														</li>
														<li className="flex items-center justify-between gap-4 pb-3 border-b border-white/10">
															<span>Status</span>
															<span className="font-mono text-slate-200/90">
																{meeting.status}
															</span>
														</li>
														<li className="flex items-center justify-between gap-4">
															<span>Progress</span>
															<span className="font-mono text-slate-200/90">
																{clampedProgress.toFixed(1)}%
															</span>
														</li>
													</ul>
												</div>
											</section>

											{/* 3. Analytics Dashboard */}
											<section
												id="analytics"
												className="space-y-5 rounded-3xl border border-indigo-500/30 bg-linear-to-br from-indigo-500/10 via-slate-900/90 to-slate-900 p-8 shadow-[0_25px_65px_rgba(15,23,42,0.55)] backdrop-blur-sm"
											>
												<div className="flex items-center gap-3">
													<div className="rounded-xl bg-purple-500/20 p-2.5 shadow-lg">
														<svg className="h-5 w-5 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
														</svg>
													</div>
													<div>
														<p className="text-xs uppercase tracking-[0.3em] text-indigo-200">
															AI-Powered Analytics
														</p>
														<h2 className="mt-1 text-xl font-semibold text-white">
															Meeting Insights & Intelligence
														</h2>
													</div>
												</div>
												<AnalyticsDashboard jobId={meeting.job_id} />
											</section>

											

											
										</main>
									</div>
								</div>
							</div>
						</div>
	);
}