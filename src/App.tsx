import React, { useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileAudio, FileVideo, X, CheckCircle2, Loader2, Download, Scissors, User, Filter, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { transcribeAudio, TranscriptSegment } from './services/geminiService';
import { fileToBase64, formatTime, cn } from './utils/helpers';
import Waveform from './components/Waveform';
import WaveSurfer from 'wavesurfer.js';

type AppState = 'idle' | 'uploading' | 'processing' | 'ready';

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [serverFile, setServerFile] = useState<{ filename: string; path: string } | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [isTrimming, setIsTrimming] = useState<string | null>(null);

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      handleUpload(acceptedFiles[0]);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a'],
      'video/*': ['.mp4']
    },
    multiple: false
  } as any);

  const handleUpload = async (file: File) => {
    setFile(file);
    setState('uploading');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/upload', formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(progress);
        }
      });

      setServerFile(response.data);
      processFile(file);
    } catch (error) {
      console.error('Upload failed:', error);
      setState('idle');
    }
  };

  const processFile = async (file: File) => {
    setState('processing');
    try {
      const base64 = await fileToBase64(file);
      const result = await transcribeAudio(base64, file.type);
      setTranscript(result);
      
      // Initialize speaker names
      const uniqueSpeakers = Array.from(new Set(result.map(s => s.speaker)));
      const names: Record<string, string> = {};
      uniqueSpeakers.forEach(s => {
        names[s] = s;
      });
      setSpeakerNames(names);
      
      setState('ready');
    } catch (error) {
      console.error('Processing failed:', error);
      setState('ready'); // Fallback to ready even if AI fails for UI testing
    }
  };

  const handleSpeakerRename = (id: string, newName: string) => {
    setSpeakerNames(prev => ({ ...prev, [id]: newName }));
  };

  const handleTimestampEdit = (index: number, field: 'start' | 'end', value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    setTranscript(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: numValue };
      return next;
    });
  };

  const handleTrimSpeaker = async (speakerId: string) => {
    if (!serverFile) return;
    setIsTrimming(speakerId);

    const speakerSegments = transcript.filter(s => s.speaker === speakerId);
    
    try {
      const response = await axios.post('/api/trim-speaker', {
        filename: serverFile.filename,
        segments: speakerSegments,
        speakerName: speakerNames[speakerId]
      });

      // Trigger download
      const link = document.createElement('a');
      link.href = response.data.downloadUrl;
      link.download = response.data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Trimming failed:', error);
    } finally {
      setIsTrimming(null);
    }
  };

  const filteredTranscript = useMemo(() => {
    if (!selectedSpeaker) return transcript;
    return transcript.filter(s => s.speaker === selectedSpeaker);
  }, [transcript, selectedSpeaker]);

  const speakers = useMemo(() => {
    return Object.keys(speakerNames);
  }, [speakerNames]);

  const exportTranscript = (speakerId?: string) => {
    const data = speakerId 
      ? transcript.filter(s => s.speaker === speakerId)
      : transcript;
    
    const text = data.map(s => 
      `[${formatTime(s.start)} - ${formatTime(s.end)}] ${speakerNames[s.speaker]}:\n${s.text}\n`
    ).join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${speakerId ? speakerNames[speakerId] : 'Full'}_Transcript.txt`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-bottom border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">V</div>
            <h1 className="text-xl font-semibold tracking-tight">VoxSplit AI</h1>
          </div>
          {state === 'ready' && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => exportTranscript()}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <Download size={16} /> Export Full
              </button>
              <button 
                onClick={() => {
                  setFile(null);
                  setState('idle');
                  setTranscript([]);
                }}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              >
                New Project
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <div 
                {...getRootProps()} 
                className={cn(
                  "border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer",
                  isDragActive ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200 bg-white hover:border-indigo-400"
                )}
              >
                <input {...getInputProps()} />
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Upload size={32} />
                </div>
                <h2 className="text-2xl font-semibold mb-2">Upload your media</h2>
                <p className="text-slate-500 mb-8">Drag and drop audio or video files up to 2 hours</p>
                <div className="flex justify-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1"><FileAudio size={16} /> MP3, WAV, M4A</span>
                  <span className="flex items-center gap-1"><FileVideo size={16} /> MP4</span>
                </div>
              </div>
            </motion.div>
          )}

          {(state === 'uploading' || state === 'processing') && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-md mx-auto text-center py-20"
            >
              <div className="relative w-24 h-24 mx-auto mb-8">
                <Loader2 className="w-full h-full text-indigo-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-600">
                  {state === 'uploading' ? `${uploadProgress}%` : 'AI'}
                </div>
              </div>
              <h2 className="text-2xl font-semibold mb-2">
                {state === 'uploading' ? 'Uploading file...' : 'Analyzing speakers...'}
              </h2>
              <p className="text-slate-500">
                {state === 'uploading' 
                  ? 'Sending your file to our secure servers' 
                  : 'Our AI is transcribing and identifying speakers. This may take a minute for longer files.'}
              </p>
            </motion.div>
          )}

          {state === 'ready' && serverFile && (
            <motion.div 
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Left Column: Controls & Speakers */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <User size={18} className="text-indigo-600" /> Speakers
                  </h3>
                  <div className="space-y-4">
                    {speakers.map((id, idx) => (
                      <div key={id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-3">
                          <input 
                            type="text"
                            value={speakerNames[id]}
                            onChange={(e) => handleSpeakerRename(id, e.target.value)}
                            className="bg-transparent font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1 -ml-1"
                          />
                          <div className={`w-3 h-3 rounded-full bg-indigo-${(idx + 4) * 100}`} />
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleTrimSpeaker(id)}
                            disabled={isTrimming === id}
                            className="flex-1 text-xs font-semibold py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                          >
                            {isTrimming === id ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />}
                            Trim Audio
                          </button>
                          <button 
                            onClick={() => exportTranscript(id)}
                            className="flex-1 text-xs font-semibold py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                          >
                            <Download size={12} />
                            Transcript
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Filter size={18} className="text-indigo-600" /> Filter View
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => setSelectedSpeaker(null)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                        selectedSpeaker === null ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      All
                    </button>
                    {speakers.map(id => (
                      <button 
                        key={id}
                        onClick={() => setSelectedSpeaker(id)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                          selectedSpeaker === id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        {speakerNames[id]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Waveform & Transcript */}
              <div className="lg:col-span-8 space-y-6">
                <Waveform 
                  url={serverFile.path} 
                  onTimeUpdate={setCurrentTime}
                  onReady={setWavesurfer}
                  currentTime={currentTime}
                />

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-semibold">Transcript</h3>
                    <span className="text-xs text-slate-400 font-mono">{formatTime(currentTime)}</span>
                  </div>
                  <div className="max-h-[600px] overflow-y-auto p-6 space-y-8">
                    {filteredTranscript.map((seg, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "group relative pl-4 border-l-2 transition-all",
                          currentTime >= seg.start && currentTime <= seg.end 
                            ? "border-indigo-600 bg-indigo-50/30 -mx-2 px-2 py-2 rounded-r-lg" 
                            : "border-transparent"
                        )}
                        onClick={() => wavesurfer?.setTime(seg.start)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                              {speakerNames[seg.speaker]}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                              <input 
                                type="number" 
                                step="0.1"
                                value={seg.start}
                                onChange={(e) => handleTimestampEdit(idx, 'start', e.target.value)}
                                className="w-12 bg-transparent hover:bg-slate-100 rounded px-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span>-</span>
                              <input 
                                type="number" 
                                step="0.1"
                                value={seg.end}
                                onChange={(e) => handleTimestampEdit(idx, 'end', e.target.value)}
                                className="w-12 bg-transparent hover:bg-slate-100 rounded px-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                        </div>
                        <p className="text-slate-700 leading-relaxed cursor-pointer">
                          {seg.text}
                        </p>
                      </div>
                    ))}
                    {filteredTranscript.length === 0 && (
                      <div className="text-center py-12 text-slate-400 italic">
                        No segments found for this speaker.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
