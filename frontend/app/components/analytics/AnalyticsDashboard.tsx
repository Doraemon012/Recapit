"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import("react-plotly.js"), { 
	ssr: false,
	loading: () => (
		<div className="flex h-80 w-full items-center justify-center">
			<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
		</div>
	)
}) as any;

interface AnalyticsData {
	meeting_id: string;
	status: string;
	action_items?: ActionItem[];
	speaker_stats?: SpeakerStat[];
	sentiment?: SentimentData;
	topics?: Topic[];
	timeline?: TimelineEvent[];
	entities?: NamedEntities;
	insights?: string[];
	metrics?: MeetingMetrics;
	charts?: {
		speaker_distribution?: string;
		sentiment_timeline?: string;
		topic_distribution?: string;
		participation_metrics?: string;
	};
}

interface ActionItem {
	task: string;
	owner: string;
	priority: string;
	mentioned_at: number;
	context: string;
}

interface SpeakerStat {
	speaker: string;
	word_count: number;
	speaking_time: number;
	turn_count: number;
	engagement_score: number;
}

interface SentimentData {
	overall: string;
	score: number;
	confidence: number;
	timeline?: Array<{
		timestamp: number;
		sentiment: string;
		score: number;
		reason: string;
	}>;
}

interface Topic {
	topic: string;
	keywords: string[];
	mentioned_at: number[];
	relevance_score: number;
	summary: string;
}

interface TimelineEvent {
	timestamp: number;
	event_type: string;
	title: string;
	description: string;
	participants: string[];
}

interface NamedEntities {
	people?: string[];
	organizations?: string[];
	dates?: string[];
	locations?: string[];
	products?: string[];
	documents?: string[];
}

interface MeetingMetrics {
	total_duration: number;
	total_speakers: number;
	participation_balance: number;
	decision_count: number;
	question_count: number;
	engagement_level: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export function AnalyticsDashboard({ jobId }: { jobId: string }) {
	const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function fetchAnalytics() {
			try {
				const res = await fetch(`${API_BASE}/api/v1/analytics/${jobId}`, {
					credentials: "include",
				});

				if (!res.ok) {
					throw new Error("Failed to load analytics");
				}

				const data = await res.json();
				setAnalytics(data);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		}

		fetchAnalytics();
	}, [jobId]);

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="text-center">
					<div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
					<p className="mt-4 text-slate-300">Loading analytics...</p>
				</div>
			</div>
		);
	}

	if (error || !analytics) {
		return (
			<div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
				<p className="text-rose-300">
					{error || "Analytics not available"}
				</p>
			</div>
		);
	}

	if (analytics.status === "pending") {
		return (
			<div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
				<p className="text-amber-300">
					Analytics are being generated. Please check back shortly.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			{/* Key Metrics Overview */}
			{analytics.metrics && (
				<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<MetricCard
						label="Duration"
						value={formatDuration(analytics.metrics.total_duration)}
						icon="⏱️"
					/>
					<MetricCard
						label="Speakers"
						value={analytics.metrics.total_speakers.toString()}
						icon="👥"
					/>
					<MetricCard
						label="Decisions"
						value={analytics.metrics.decision_count.toString()}
						icon="✓"
					/>
					<MetricCard
						label="Engagement"
						value={analytics.metrics.engagement_level}
						icon="📊"
					/>
				</section>
			)}

			{/* Sentiment Overview */}
			{analytics.sentiment && (
				<section className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_55px_rgba(15,23,42,0.45)] backdrop-blur-sm">
					<h2 className="mb-6 text-xl font-semibold text-white">
						Sentiment Analysis
					</h2>
					<div className="grid gap-6 lg:grid-cols-2">
						<div className="space-y-4">
							<div className="rounded-2xl border border-white/10 bg-white/5 p-6">
								<div className="flex items-center gap-4">
									<div
										className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${getSentimentColor(
											analytics.sentiment.overall
										)}`}
									>
										{getSentimentEmoji(
											analytics.sentiment.overall
										)}
									</div>
									<div>
										<p className="text-sm uppercase tracking-wider text-slate-400">
											Overall Sentiment
										</p>
										<p className="text-2xl font-bold text-white">
											{analytics.sentiment.overall}
										</p>
										<p className="text-sm text-slate-300">
											Confidence:{" "}
											{(
												analytics.sentiment.confidence *
												100
											).toFixed(0)}
											%
										</p>
									</div>
								</div>
							</div>
							<div className="rounded-2xl border border-white/10 bg-white/5 p-6">
								<p className="mb-2 text-sm uppercase tracking-wider text-slate-400">
									Sentiment Score
								</p>
								<div className="relative h-4 overflow-hidden rounded-full bg-slate-700">
									<div
										className="h-full rounded-full bg-linear-to-r from-rose-500 via-amber-500 to-emerald-500"
										style={{
											width: `${
												((analytics.sentiment.score +
													1) /
													2) *
												100
											}%`,
										}}
									/>
								</div>
								<div className="mt-2 flex justify-between text-xs text-slate-400">
									<span>Negative</span>
									<span>Neutral</span>
									<span>Positive</span>
								</div>
							</div>
						</div>
						<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
							{analytics.charts?.sentiment_timeline && (
								<PlotlyChart
									data={analytics.charts.sentiment_timeline}
								/>
							)}
						</div>
					</div>
				</section>
			)}

			{/* Action Items */}
			{analytics.action_items && analytics.action_items.length > 0 && (
				<section className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_55px_rgba(15,23,42,0.45)] backdrop-blur-sm">
					<h2 className="mb-6 text-xl font-semibold text-white">
						Action Items
					</h2>
					<div className="grid gap-4 lg:grid-cols-2">
						{analytics.action_items.map((item, idx) => (
							<div
								key={idx}
								className="rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-indigo-400/30 hover:bg-white/10"
							>
								<div className="mb-3 flex items-start justify-between gap-3">
									<span
										className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${getPriorityColor(
											item.priority
										)}`}
									>
										{item.priority}
									</span>
									<span className="text-xs text-slate-400">
										{formatTimestamp(item.mentioned_at)}
									</span>
								</div>
								<p className="mb-3 text-sm font-medium leading-snug text-white">
									{item.task}
								</p>
								<div className="space-y-2 text-xs text-slate-300">
									<div className="flex items-center gap-2">
										<span className="text-slate-400">
											Owner:
										</span>
										<span className="font-medium text-white">
											{item.owner}
										</span>
									</div>
									{item.context && (
										<p className="text-slate-400">
											{item.context}
										</p>
									)}
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Speaker Distribution & Key Topics Side by Side */}
			{((analytics.speaker_stats && analytics.speaker_stats.length > 0) || 
			  (analytics.topics && analytics.topics.length > 0)) && (
				<section className="grid gap-8 lg:grid-cols-2">
					{/* Speaker Distribution */}
					{analytics.speaker_stats && analytics.speaker_stats.length > 0 && (
						<div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_55px_rgba(15,23,42,0.45)] backdrop-blur-sm">
							<h2 className="mb-6 text-xl font-semibold text-white">
								Speaker Distribution
							</h2>
							<div className="space-y-6">
								<div className="space-y-4">
									{analytics.speaker_stats.map((speaker, idx) => (
										<div
											key={idx}
											className="rounded-2xl border border-white/10 bg-white/5 p-5"
										>
											<div className="mb-3 flex items-center justify-between">
												<span className="font-medium text-white">
													{speaker.speaker}
												</span>
												<span className="text-sm text-indigo-300">
													{speaker.engagement_score}/100
												</span>
											</div>
											<div className="grid grid-cols-3 gap-3 text-xs">
												<div>
													<p className="text-slate-400">
														Words
													</p>
													<p className="font-semibold text-white">
														{speaker.word_count}
													</p>
												</div>
												<div>
													<p className="text-slate-400">
														Time
													</p>
													<p className="font-semibold text-white">
														{formatDuration(
															speaker.speaking_time
														)}
													</p>
												</div>
												<div>
													<p className="text-slate-400">
														Turns
													</p>
													<p className="font-semibold text-white">
														{speaker.turn_count}
													</p>
												</div>
											</div>
										</div>
									))}
								</div>
								{analytics.charts?.speaker_distribution && (
									<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
										<PlotlyChart
											data={analytics.charts.speaker_distribution}
										/>
									</div>
								)}
							</div>
						</div>
					)}
					
					{/* Key Topics */}
					{analytics.topics && analytics.topics.length > 0 && (
						<div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_55px_rgba(15,23,42,0.45)] backdrop-blur-sm">
							<h2 className="mb-6 text-xl font-semibold text-white">
								Key Topics Discussed
							</h2>
							<div className="space-y-6">
								<div className="space-y-4">
									{analytics.topics.slice(0, 5).map((topic, idx) => (
										<div
											key={idx}
											className="rounded-2xl border border-white/10 bg-white/5 p-5"
										>
											<div className="mb-2 flex items-start justify-between gap-3">
												<h3 className="font-semibold text-white">
													{topic.topic}
												</h3>
												<span className="shrink-0 text-sm font-medium text-indigo-300">
													{topic.relevance_score}%
												</span>
											</div>
											<p className="mb-3 text-sm text-slate-300">
												{topic.summary}
											</p>
											<div className="flex flex-wrap gap-2">
												{topic.keywords.map((kw, kidx) => (
													<span
														key={kidx}
														className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs text-indigo-200"
													>
														{kw}
													</span>
												))}
											</div>
										</div>
									))}
								</div>
								{analytics.charts?.topic_distribution && (
									<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
										<PlotlyChart
											data={analytics.charts.topic_distribution}
										/>
									</div>
								)}
							</div>
						</div>
					)}
				</section>
			)}

			{/* Timeline */}
			{analytics.timeline && analytics.timeline.length > 0 && (
				<section className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_55px_rgba(15,23,42,0.45)] backdrop-blur-sm">
					<h2 className="mb-6 text-xl font-semibold text-white">
						Meeting Timeline
					</h2>
					<div className="relative space-y-6 border-l-2 border-indigo-500/30 pl-10">
						{analytics.timeline.map((event, idx) => (
							<div key={idx} className="relative">
								<div className="absolute -left-[2.6rem] top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-indigo-500 bg-slate-900">
									{getEventIcon(event.event_type)}
								</div>
								<div className="rounded-2xl border border-white/10 bg-white/5 p-5">
									<div className="mb-2 flex items-start justify-between gap-3">
										<div>
											<span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
												{formatTimestamp(
													event.timestamp
												)}
											</span>
											<h3 className="mt-1 font-semibold text-white">
												{event.title}
											</h3>
										</div>
										<span className="shrink-0 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-200">
											{event.event_type}
										</span>
									</div>
									<p className="mb-3 text-sm text-slate-300">
										{event.description}
									</p>
									{event.participants.length > 0 && (
										<div className="flex flex-wrap gap-2">
											{event.participants.map((p, pidx) => (
												<span
													key={pidx}
													className="text-xs text-slate-400"
												>
													{p}
												</span>
											))}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Key Insights */}
			{analytics.insights && analytics.insights.length > 0 && (
				<section className="rounded-3xl border border-indigo-500/30 bg-linear-to-br from-indigo-500/20 via-slate-900/90 to-slate-900 p-8 shadow-[0_25px_65px_rgba(15,23,42,0.55)] backdrop-blur-sm">
					<h2 className="mb-6 text-xl font-semibold text-white">
						Key Insights
					</h2>
					<ul className="space-y-3">
						{analytics.insights.map((insight, idx) => (
							<li
								key={idx}
								className="flex items-start gap-3 text-slate-200"
							>
								<span className="mt-1 text-indigo-400">
									💡
								</span>
								<span>{insight}</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{/* Named Entities */}
			{analytics.entities && (
				<section className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_20px_55px_rgba(15,23,42,0.45)] backdrop-blur-sm">
					<h2 className="mb-6 text-xl font-semibold text-white">
						Named Entities
					</h2>
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{analytics.entities.people &&
							analytics.entities.people.length > 0 && (
								<EntityCard
									label="People"
									icon="👤"
									items={analytics.entities.people}
								/>
							)}
						{analytics.entities.organizations &&
							analytics.entities.organizations.length > 0 && (
								<EntityCard
									label="Organizations"
									icon="🏢"
									items={analytics.entities.organizations}
								/>
							)}
						{analytics.entities.products &&
							analytics.entities.products.length > 0 && (
								<EntityCard
									label="Products"
									icon="📦"
									items={analytics.entities.products}
								/>
							)}
						{analytics.entities.documents &&
							analytics.entities.documents.length > 0 && (
								<EntityCard
									label="Documents"
									icon="📄"
									items={analytics.entities.documents}
								/>
							)}
						{analytics.entities.locations &&
							analytics.entities.locations.length > 0 && (
								<EntityCard
									label="Locations"
									icon="📍"
									items={analytics.entities.locations}
								/>
							)}
						{analytics.entities.dates &&
							analytics.entities.dates.length > 0 && (
								<EntityCard
									label="Dates"
									icon="📅"
									items={analytics.entities.dates}
								/>
							)}
					</div>
				</section>
			)}
		</div>
	);
}

// Helper Components

function MetricCard({
	label,
	value,
	icon,
}: {
	label: string;
	value: string;
	icon: string;
}) {
	return (
		<div className="rounded-2xl border border-white/10 bg-white/5 p-6 transition-all hover:border-indigo-400/30 hover:bg-white/10">
			<div className="mb-3 text-2xl">{icon}</div>
			<p className="text-xs uppercase tracking-wider text-slate-400">
				{label}
			</p>
			<p className="mt-2 text-2xl font-bold text-white">{value}</p>
		</div>
	);
}

function EntityCard({
	label,
	icon,
	items,
}: {
	label: string;
	icon: string;
	items: string[];
}) {
	return (
		<div className="rounded-2xl border border-white/10 bg-white/5 p-5">
			<div className="mb-3 flex items-center gap-2">
				<span className="text-xl">{icon}</span>
				<h3 className="font-semibold text-white">{label}</h3>
			</div>
			<ul className="space-y-2">
				{items.slice(0, 5).map((item, idx) => (
					<li key={idx} className="text-sm text-slate-300">
						• {item}
					</li>
				))}
				{items.length > 5 && (
					<li className="text-xs text-slate-400">
						+{items.length - 5} more
					</li>
				)}
			</ul>
		</div>
	);
}

function PlotlyChart({ data }: { data: string }) {
	try {
		const plotData = JSON.parse(data);
		
		// Enhanced layout configuration
		const enhancedLayout = {
			...plotData.layout,
			paper_bgcolor: "rgba(0,0,0,0)",
			plot_bgcolor: "rgba(15,23,42,0.3)",
			font: { 
				color: "#e2e8f0", 
				size: 12,
				family: "Inter, system-ui, sans-serif"
			},
			autosize: true,
			margin: { l: 50, r: 30, t: 30, b: 50 },
			showlegend: true,
			legend: {
				bgcolor: "rgba(0,0,0,0)",
				bordercolor: "rgba(255,255,255,0.1)",
				font: { color: "#cbd5e1", size: 11 }
			},
			// Enhanced color scheme
			colorway: [
				"#6366f1", "#8b5cf6", "#06b6d4", "#10b981", 
				"#f59e0b", "#ef4444", "#ec4899", "#84cc16"
			],
			// Hover effects
			hoverlabel: {
				bgcolor: "rgba(15,23,42,0.9)",
				bordercolor: "#6366f1",
				font: { color: "#f1f5f9" }
			}
		};

		return (
			<div className="h-80 w-full">
				<Plot
					data={plotData.data}
					layout={enhancedLayout}
					config={{ 
						responsive: true, 
						displayModeBar: false
					}}
					style={{ width: "100%", height: "100%" }}
				/>
			</div>
		);
	} catch (e) {
		return (
			<div className="flex h-80 w-full items-center justify-center rounded-lg border border-dashed border-white/20 bg-slate-900/30">
				<div className="text-center">
					<svg className="mx-auto h-8 w-8 text-slate-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4" />
					</svg>
					<p className="text-sm text-slate-400">Chart visualization unavailable</p>
				</div>
			</div>
		);
	}
}

// Helper Functions

function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getSentimentColor(sentiment: string): string {
	switch (sentiment.toLowerCase()) {
		case "positive":
			return "bg-emerald-500/20 text-emerald-300";
		case "negative":
			return "bg-rose-500/20 text-rose-300";
		default:
			return "bg-slate-500/20 text-slate-300";
	}
}

function getSentimentEmoji(sentiment: string): string {
	switch (sentiment.toLowerCase()) {
		case "positive":
			return "😊";
		case "negative":
			return "😟";
		default:
			return "😐";
	}
}

function getPriorityColor(priority: string): string {
	switch (priority.toLowerCase()) {
		case "high":
			return "bg-rose-500/20 text-rose-300 border border-rose-400/30";
		case "medium":
			return "bg-amber-500/20 text-amber-300 border border-amber-400/30";
		default:
			return "bg-sky-500/20 text-sky-300 border border-sky-400/30";
	}
}

function getEventIcon(eventType: string): string {
	switch (eventType.toLowerCase()) {
		case "decision":
			return "✓";
		case "question":
			return "?";
		case "action":
			return "→";
		default:
			return "•";
	}
}
