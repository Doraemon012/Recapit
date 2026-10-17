"use client";

import { useMeetingData } from "./MeetingRecapClient";
import type { MeetingJobStatus } from "@/app/models/meeting";
import Link from "next/link";
import { SummaryDownloadButton } from "@/app/components/SummaryDownloadButton";
import { AnalyticsDashboard } from "@/app/components/analytics/AnalyticsDashboard";
import { SidebarLink } from "../../components/SidebarLink";

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

export function MeetingPageClient({ initialMeeting, pageContent }: { 
	initialMeeting: MeetingJobStatus;
	pageContent: (meeting: MeetingJobStatus, helpers: {
		formatDate: typeof formatDate;
		formatTime: typeof formatTime;
		statusAccent: typeof statusAccent;
	}) => React.ReactNode;
}) {
	const meeting = useMeetingData(initialMeeting);
	
	return <>{pageContent(meeting, { formatDate, formatTime, statusAccent })}</>;
}
