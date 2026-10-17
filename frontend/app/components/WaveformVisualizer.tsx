"use client";

import { useEffect, useRef, useState } from "react";

interface WaveformVisualizerProps {
  audioUrl?: string;
  currentTime?: number;
  duration?: number;
  onSeek?: (time: number) => void;
  className?: string;
}

export function WaveformVisualizer({ 
  audioUrl, 
  currentTime = 0, 
  duration = 0,
  onSeek,
  className = "" 
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  
  // Generate mock waveform data for visual effect
  useEffect(() => {
    if (!duration) return;
    
    const generateMockWaveform = () => {
      const samples = Math.min(200, Math.max(50, Math.floor(duration * 2)));
      const data: number[] = [];
      
      for (let i = 0; i < samples; i++) {
        // Create a more realistic waveform pattern
        const baseAmplitude = 0.3 + Math.random() * 0.4;
        const envelope = Math.sin((i / samples) * Math.PI) * 0.8 + 0.2;
        const noise = (Math.random() - 0.5) * 0.3;
        data.push((baseAmplitude + noise) * envelope);
      }
      return data;
    };
    
    setWaveformData(generateMockWaveform());
  }, [duration]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const barCount = waveformData.length;
    const barWidth = width / barCount;
    const progressPosition = duration > 0 ? (currentTime / duration) * width : 0;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform bars
    waveformData.forEach((amplitude, index) => {
      const barHeight = amplitude * height * 0.8;
      const x = index * barWidth;
      const y = (height - barHeight) / 2;
      
      // Determine bar color based on progress
      const isPlayed = x < progressPosition;
      
      ctx.fillStyle = isPlayed 
        ? "#6366f1" // Indigo for played portion
        : "#334155"; // Slate for unplayed portion
      
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });

    // Draw progress line
    if (duration > 0) {
      ctx.strokeStyle = "#f1f5f9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressPosition, 0);
      ctx.lineTo(progressPosition, height);
      ctx.stroke();
    }
  }, [waveformData, currentTime, duration]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !duration) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickProgress = x / canvas.width;
    const seekTime = clickProgress * duration;
    
    onSeek(Math.max(0, Math.min(duration, seekTime)));
  };

  return (
    <div ref={containerRef} className={`relative overflow-hidden rounded-lg ${className}`}>
      <canvas
        ref={canvasRef}
        width={800}
        height={80}
        onClick={handleCanvasClick}
        className="h-20 w-full cursor-pointer transition-opacity hover:opacity-80"
        style={{ background: 'linear-gradient(90deg, rgba(51, 65, 85, 0.3), rgba(51, 65, 85, 0.1))' }}
      />
      
      {!waveformData.length && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-400">
            <div className="h-1 w-1 rounded-full bg-slate-400 animate-pulse" />
            <div className="h-1 w-1 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="h-1 w-1 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      )}
      
      {duration > 0 && (
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>Click to seek</span>
          <span>{Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}</span>
        </div>
      )}
    </div>
  );
}