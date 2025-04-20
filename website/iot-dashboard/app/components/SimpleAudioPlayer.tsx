"use client";

import { useRef, useState } from 'react';

interface AudioPlayerProps {
  readingId: string;
}

const SimpleAudioPlayer: React.FC<AudioPlayerProps> = ({ readingId }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        setError(`Error playing audio: ${err.message}`);
      });
    }
  };

  return (
    <div className="mt-4 p-3 bg-gray-800 rounded-lg">
      <div className="mb-3">
        <button 
          onClick={handlePlayPause}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>
      </div>
      
      {error && <div className="text-red-400 text-sm">{error}</div>}
      
      <audio 
        ref={audioRef}
        src={`/api/audio/${readingId}`}
        className="w-full"
        controls
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadStart={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onError={(e) => {
          setError("Failed to load audio");
          setLoading(false);
        }}
      />
      {loading && <div className="text-gray-400 text-sm mt-2">Loading audio...</div>}
    </div>
  );
};

export default SimpleAudioPlayer;