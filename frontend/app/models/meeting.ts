export type MeetingQueuedPayload = {
  job_id: string;
  filename: string;
  content_type: string;
  status: string;
  created_at: string;
  progress_percent: number;
  status_message?: string | null;
};

export type TranscriptSegment = {
  speaker: string;
  start: number;
  end: number;
  text: string;
};

export type MeetingJobStatus = MeetingQueuedPayload & {
  updated_at?: string | null;
  completed_at?: string | null;
  transcript?: string | null;
  summary?: string | null;
  transcript_segments?: TranscriptSegment[];
};
