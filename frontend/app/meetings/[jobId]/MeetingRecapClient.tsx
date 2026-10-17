"use client";

import { useEffect, useState } from "react";
import type { MeetingJobStatus } from "@/app/models/meeting";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const TERMINAL_STATUSES = new Set(["completed", "failed", "error", "done", "succeeded"]);

interface MeetingRecapClientProps {
	initialMeeting: MeetingJobStatus;
	children: React.ReactNode;
	onMeetingUpdate?: (meeting: MeetingJobStatus) => void;
}

export function MeetingRecapClient({ initialMeeting, children }: MeetingRecapClientProps) {
	const [meeting, setMeeting] = useState<MeetingJobStatus>(initialMeeting);

	useEffect(() => {
		const jobId = meeting.job_id;
		const lowerStatus = meeting.status.toLowerCase();

		// If already completed, don't poll
		if (TERMINAL_STATUSES.has(lowerStatus)) {
			return;
		}

		let isActive = true;
		let intervalId: NodeJS.Timeout | undefined;

		const poll = async () => {
			try {
				const res = await fetch(`${API_BASE}/api/v1/meetings/${jobId}`, {
					cache: "no-store",
					credentials: "include",
				});

				if (!res.ok) {
					console.error(`Failed to poll meeting ${jobId}: ${res.status}`);
					return;
				}

				const data = (await res.json()) as MeetingJobStatus;
				if (!isActive) {
					return;
				}

				setMeeting(data);

				// Stop polling if completed
				if (TERMINAL_STATUSES.has(data.status.toLowerCase())) {
					if (intervalId) {
						clearInterval(intervalId);
					}
					console.log(`Meeting ${jobId} completed, stopped polling`);
				}
			} catch (error) {
				console.error("Meeting polling error", error);
			}
		};

		// Start polling every 2.5 seconds
		console.log(`Starting polling for meeting ${jobId} (status: ${meeting.status})`);
		intervalId = setInterval(poll, 2500);

		// Also poll immediately
		void poll();

		return () => {
			isActive = false;
			if (intervalId) {
				clearInterval(intervalId);
			}
			console.log(`Stopped polling for meeting ${jobId}`);
		};
	}, [meeting.job_id, meeting.status]);

	return <>{children}</>;
}

export function useMeetingData(initialMeeting: MeetingJobStatus) {
	const [meeting, setMeeting] = useState<MeetingJobStatus>(initialMeeting);

	useEffect(() => {
		const jobId = meeting.job_id;
		const lowerStatus = meeting.status.toLowerCase();

		// If already completed, don't poll
		if (TERMINAL_STATUSES.has(lowerStatus)) {
			return;
		}

		let isActive = true;
		let intervalId: NodeJS.Timeout | undefined;

		const poll = async () => {
			try {
				const res = await fetch(`${API_BASE}/api/v1/meetings/${jobId}`, {
					cache: "no-store",
					credentials: "include",
				});

				if (!res.ok) {
					console.error(`Failed to poll meeting ${jobId}: ${res.status}`);
					return;
				}

				const data = (await res.json()) as MeetingJobStatus;
				if (!isActive) {
					return;
				}

				setMeeting(data);

				// Stop polling if completed
				if (TERMINAL_STATUSES.has(data.status.toLowerCase())) {
					if (intervalId) {
						clearInterval(intervalId);
					}
					console.log(`Meeting ${jobId} completed, stopped polling`);
				}
			} catch (error) {
				console.error("Meeting polling error", error);
			}
		};

		// Start polling every 2.5 seconds
		console.log(`Starting polling for meeting ${jobId} (status: ${meeting.status})`);
		intervalId = setInterval(poll, 2500);

		// Also poll immediately
		void poll();

		return () => {
			isActive = false;
			if (intervalId) {
				clearInterval(intervalId);
			}
			console.log(`Stopped polling for meeting ${jobId}`);
		};
	}, [meeting.job_id, meeting.status]);

	return meeting;
}
