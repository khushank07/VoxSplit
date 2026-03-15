import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface WaveformProps {
  url: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: (wavesurfer: WaveSurfer) => void;
  currentTime?: number;
}

const Waveform: React.FC<WaveformProps> = ({ url, onTimeUpdate, onReady, currentTime }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#4f46e5',
      barWidth: 2,
      barRadius: 3,
      height: 80,
      normalize: true,
    });

    ws.load(url);

    ws.on('ready', () => {
      wavesurferRef.current = ws;
      if (onReady) onReady(ws);
    });

    ws.on('audioprocess', () => {
      if (onTimeUpdate) onTimeUpdate(ws.getCurrentTime());
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    return () => {
      ws.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (wavesurferRef.current && currentTime !== undefined) {
      const current = wavesurferRef.current.getCurrentTime();
      if (Math.abs(current - currentTime) > 0.1) {
        wavesurferRef.current.setTime(currentTime);
      }
    }
  }, [currentTime]);

  const togglePlay = () => {
    wavesurferRef.current?.playPause();
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div ref={containerRef} className="mb-4" />
      <div className="flex items-center justify-center gap-4">
        <button 
          onClick={() => wavesurferRef.current?.skip(-5)}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <SkipBack size={20} />
        </button>
        <button 
          onClick={togglePlay}
          className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-lg"
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
        <button 
          onClick={() => wavesurferRef.current?.skip(5)}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <SkipForward size={20} />
        </button>
      </div>
    </div>
  );
};

export default Waveform;
