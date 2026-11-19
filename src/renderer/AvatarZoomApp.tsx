import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useTheme } from './hooks/useTheme';

export const AvatarZoomApp: React.FC = () => {
  useTheme();

  const params = new URLSearchParams(window.location.search);
  const imageUrl = params.get('url') || '';
  const title = params.get('title') || 'Display Picture';

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const dragDistanceRef = useRef(0);

  // Escape key to close window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.electronAPI?.closeWindow?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Smooth wheel zooming
  useEffect(() => {
    const el = imageViewportRef.current;
    if (!el || !imageUrl) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom((prev) => {
        const next = Math.min(Math.max(1, prev * factor), 8);
        if (next === 1) {
          setPan({ x: 0, y: 0 });
        }
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [imageUrl]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="h-12 px-4 flex items-center justify-between z-20 bg-[#182229] border-b border-[#2c3943] shrink-0">
        <div className="flex items-center gap-2 max-w-[65%]">
          <span className="text-[#e9edef] text-sm font-semibold truncate">
            {title}
          </span>
          <span className="text-[10px] text-[#8696a0] bg-[#202c33] px-2 py-0.5 rounded-full border border-[#2c3943]">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          {zoom > 1 && (
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1.5 text-[#8696a0] hover:text-[#e9edef] rounded-lg bg-[#202c33] hover:bg-[#2a3942] border border-[#2c3943] transition-colors"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => window.electronAPI?.closeWindow?.()}
            className="p-1.5 text-[#8696a0] hover:text-[#e9edef] rounded-lg bg-[#202c33] hover:bg-[#2a3942] border border-[#2c3943] transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Zoomable Image Viewport */}
      <div
        ref={imageViewportRef}
        onMouseDown={(e) => {
          dragDistanceRef.current = 0;
          if (zoom <= 1) return;
          e.preventDefault();
          setIsDragging(true);
          dragStart.current = {
            x: e.clientX,
            y: e.clientY,
            startPanX: pan.x,
            startPanY: pan.y,
          };
        }}
        onMouseMove={(e) => {
          if (!isDragging) return;
          const dx = e.clientX - dragStart.current.x;
          const dy = e.clientY - dragStart.current.y;
          dragDistanceRef.current += Math.hypot(dx, dy);
          setPan({
            x: dragStart.current.startPanX + dx,
            y: dragStart.current.startPanY + dy,
          });
        }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onDoubleClick={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }}
        className={`flex-1 relative overflow-hidden flex items-center justify-center ${
          zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isDragging ? 'none' : 'transform 0.12s ease-out',
            }}
            className="max-h-[calc(100vh-3.5rem)] max-w-[calc(100vw-2rem)] object-contain shadow-2xl pointer-events-auto rounded-lg"
          />
        ) : (
          <div className="text-xs text-[#8696a0]">No image provided</div>
        )}
      </div>
    </div>
  );
};
