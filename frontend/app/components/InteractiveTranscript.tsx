"use client";

import { useState, useEffect, useRef } from "react";
import { TranscriptSegment } from "@/app/models/meeting";

interface InteractiveTranscriptProps {
  segments: TranscriptSegment[];
  currentTime?: number;
  onSeekToTime?: (time: number) => void;
  className?: string;
}

export function InteractiveTranscript({ 
  segments, 
  currentTime = 0, 
  onSeekToTime,
  className = "" 
}: InteractiveTranscriptProps) {
  const [expandedSpeakers, setExpandedSpeakers] = useState<Set<string>>(new Set());
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  
  // Find current active segment based on timestamp
  const currentSegmentIndex = segments.findIndex((segment, index) => {
    const nextSegment = segments[index + 1];
    const segmentStart = segment.start;
    const segmentEnd = nextSegment ? nextSegment.start : Infinity;
    return currentTime >= segmentStart && currentTime < segmentEnd;
  });

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentRef.current && currentSegmentIndex >= 0) {
      activeSegmentRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }, [currentSegmentIndex]);

  const toggleSpeaker = (speaker: string) => {
    const newExpanded = new Set(expandedSpeakers);
    if (newExpanded.has(speaker)) {
      newExpanded.delete(speaker);
    } else {
      newExpanded.add(speaker);
    }
    setExpandedSpeakers(newExpanded);
  };

  const handleSegmentClick = (start: number) => {
    if (onSeekToTime) {
      onSeekToTime(start);
    }
  };

  const formatTimestamp = (start: number): string => {
    const minutes = Math.floor(start / 60);
    const seconds = Math.floor(start % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getSpeakerColor = (speaker: string): string => {
    const colors = [
      "from-blue-500 to-cyan-400",
      "from-purple-500 to-pink-400", 
      "from-green-500 to-emerald-400",
      "from-yellow-500 to-orange-400",
      "from-red-500 to-rose-400",
      "from-indigo-500 to-blue-400"
    ];
    const hash = speaker.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Group segments by speaker for better organization
  const groupedSegments = segments.reduce((acc, segment, index) => {
    const speaker = segment.speaker || "Unknown Speaker";
    if (!acc[speaker]) {
      acc[speaker] = [];
    }
    acc[speaker].push({ ...segment, originalIndex: index });
    return acc;
  }, {} as Record<string, (TranscriptSegment & { originalIndex: number })[]>);

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Interactive Transcript</h3>
          <p className="text-sm text-slate-400">Click on any segment to jump to that moment</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
          <span>Live playback sync</span>
        </div>
      </div>

      {Object.entries(groupedSegments).map(([speaker, speakerSegments]) => {
        const isExpanded = expandedSpeakers.has(speaker);
        const hasActiveSegment = speakerSegments.some(seg => seg.originalIndex === currentSegmentIndex);
        
        return (
          <div 
            key={speaker}
            className={`rounded-2xl border transition-all duration-300 ${
              hasActiveSegment 
                ? "border-indigo-400/60 bg-indigo-500/10" 
                : "border-white/10 bg-white/5"
            }`}
          >
            {/* Speaker Header */}
            <button
              onClick={() => toggleSpeaker(speaker)}
              className="w-full p-4 text-left transition-colors hover:bg-white/5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full bg-linear-to-r ${getSpeakerColor(speaker)} flex items-center justify-center text-white text-sm font-semibold`}>
                    {speaker.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{speaker}</h4>
                    <p className="text-sm text-slate-400">
                      {speakerSegments.length} segment{speakerSegments.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasActiveSegment && (
                    <div className="flex items-center gap-1 text-xs text-indigo-300">
                      <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      <span>Speaking</span>
                    </div>
                  )}
                  <svg 
                    className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Speaker Segments */}
            {isExpanded && (
              <div className="border-t border-white/10 p-4 space-y-3">
                {speakerSegments.map((segment) => {
                  const isActive = segment.originalIndex === currentSegmentIndex;
                  
                  return (
                    <div
                      key={segment.originalIndex}
                      ref={isActive ? activeSegmentRef : null}
                      onClick={() => handleSegmentClick(segment.start)}
                      className={`group cursor-pointer rounded-xl p-4 transition-all duration-200 ${
                        isActive
                          ? "bg-indigo-500/20 border border-indigo-400/30"
                          : "bg-white/5 hover:bg-white/10 border border-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                          isActive 
                            ? "bg-indigo-500 text-white" 
                            : "bg-slate-700 text-slate-300 group-hover:bg-slate-600"
                        }`}>
                          {formatTimestamp(segment.start)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`leading-relaxed transition-colors ${
                            isActive ? "text-white" : "text-slate-300 group-hover:text-white"
                          }`}>
                            {segment.text}
                          </p>
                        </div>
                      </div>
                      
                      {isActive && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-indigo-300">
                          <div className="h-1 w-1 rounded-full bg-indigo-400 animate-pulse" />
                          <span>Currently playing</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Transcript Controls */}
      <div className="rounded-xl bg-slate-800/50 p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setExpandedSpeakers(new Set(Object.keys(groupedSegments)))}
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={() => setExpandedSpeakers(new Set())}
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              Collapse All
            </button>
          </div>
          <div className="text-slate-400">
            {segments.length} total segments • {Object.keys(groupedSegments).length} speakers
          </div>
        </div>
      </div>
    </div>
  );
}