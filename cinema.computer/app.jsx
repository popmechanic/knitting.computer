import React, { useState, useCallback, useRef, useEffect } from "react";
import { useFireproof } from "use-fireproof";

// The template provides: useTenant(), CONFIG, ClerkProvider, routing
// This component is the core tenant app that gets wrapped by the template

export default function App() {
  const { dbName } = useTenant();
  const { database, useLiveQuery } = useFireproof(dbName);
  const [isDragging, setIsDragging] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef(null);
  const controlsTimeout = useRef(null);

  const { docs: videos } = useLiveQuery("type", { key: "video", limit: 1 });
  const currentVideo = videos[0];

  useEffect(() => {
    if (currentVideo?._files?.video) {
      currentVideo._files.video.file().then(file => {
        const url = URL.createObjectURL(file);
        setVideoUrl(url);
      });
    }
  }, [currentVideo?._id]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files[0] && files[0].type.startsWith("video/")) {
      setIsLoading(true);
      const file = files[0];

      if (currentVideo) {
        await database.del(currentVideo._id);
      }

      const doc = {
        type: "video",
        name: file.name,
        uploadedAt: Date.now(),
        _files: { video: file }
      };

      await database.put(doc);
      setIsLoading(false);
    }
  }, [database, currentVideo]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 2500);
  };

  const clearVideo = async () => {
    if (currentVideo) {
      await database.del(currentVideo._id);
      setVideoUrl(null);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="w-12 h-12 border-2 border-[oklch(0.75_0.15_65)] border-t-transparent rounded-full animate-spin" />
          <p className="mt-6 text-[oklch(0.45_0.02_250)] text-sm">Loading film...</p>
        </div>
      ) : videoUrl ? (
        <div className="relative group" onMouseMove={handleMouseMove} onMouseLeave={() => setShowControls(false)}>
          <div className="absolute -inset-4 bg-[oklch(0.75_0.15_65)] opacity-5 blur-3xl rounded-3xl transition-opacity duration-700 group-hover:opacity-10" />
          <div className="relative bg-[oklch(0.05_0.01_250)] rounded-lg overflow-hidden shadow-2xl">
            <video
              ref={videoRef}
              src={videoUrl}
              controls={showControls}
              className="w-full aspect-video object-contain transition-opacity duration-300"
              style={{ opacity: showControls ? 1 : 0.95 }}
            />
          </div>
          <div className={`absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[oklch(0.05_0.01_250)] to-transparent transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-[oklch(0.92_0.01_90)] font-medium truncate">
              {currentVideo?.name?.replace(/\.[^/.]+$/, "")}
            </p>
          </div>
          <button
            onClick={clearVideo}
            className="absolute top-4 right-4 text-[oklch(0.45_0.02_250)] hover:text-[oklch(0.75_0.15_65)] text-sm transition-colors duration-300"
          >
            clear screen
          </button>
        </div>
      ) : (
        <div
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative aspect-video rounded-lg border-2 border-dashed transition-all duration-500 cursor-pointer flex flex-col items-center justify-center gap-6
            ${isDragging ? 'border-[oklch(0.75_0.15_65)] bg-[oklch(0.75_0.15_65)/0.05] scale-[1.02]' : 'border-[oklch(0.25_0.02_250)] bg-[oklch(0.1_0.01_250)] hover:border-[oklch(0.35_0.02_250)]'}`}
        >
          {/* Film strip decoration - left */}
          <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-around py-4 opacity-20">
            {[...Array(12)].map((_, i) => <div key={i} className="w-4 h-2 bg-[oklch(0.3_0.01_250)] rounded-sm ml-2" />)}
          </div>

          {/* Film strip decoration - right */}
          <div className="absolute right-0 top-0 bottom-0 w-8 flex flex-col justify-around py-4 opacity-20">
            {[...Array(12)].map((_, i) => <div key={i} className="w-4 h-2 bg-[oklch(0.3_0.01_250)] rounded-sm mr-2 ml-auto" />)}
          </div>

          {/* Projector icon */}
          <div className={`transition-transform duration-500 ${isDragging ? 'scale-110' : ''}`}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" className={`transition-colors duration-300 ${isDragging ? 'text-[oklch(0.75_0.15_65)]' : 'text-[oklch(0.35_0.02_250)]'}`}>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M7.05 7.05L5.636 5.636M18.364 18.364l-1.414-1.414M7.05 16.95l-1.414 1.414M18.364 5.636l-1.414 1.414" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>

          <div className="text-center px-8">
            <p className={`text-lg font-medium transition-colors duration-300 ${isDragging ? 'text-[oklch(0.75_0.15_65)]' : 'text-[oklch(0.55_0.02_250)]'}`}>
              {isDragging ? 'Release to screen' : 'Drop a video file'}
            </p>
            <p className="text-sm text-[oklch(0.35_0.02_250)] mt-2">mp4, webm, mov</p>
          </div>
        </div>
      )}
    </div>
  );
}
