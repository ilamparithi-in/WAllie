import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw } from 'lucide-react';

interface AvatarZoomModalProps {
  data: { url: string; title: string } | null;
  onClose: () => void;
}

export const AvatarZoomModal: React.FC<AvatarZoomModalProps> = ({ data, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const dragDistanceRef = useRef(0);

  // Reset zoom & pan when opening new modal
  useEffect(() => {
    if (data) {
      setIsClosing(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      dragDistanceRef.current = 0;
    }
  }, [data]);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      dragDistanceRef.current = 0;
    }, 180);
  };

  // Keyboard Escape handler
  useEffect(() => {
    if (!data) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [data, isClosing]);

  // Non-passive wheel listener for smooth zooming
  useEffect(() => {
    const el = imageViewportRef.current;
    if (!el || !data) return;
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
  }, [data]);

  if (!data && !isClosing) return null;
  const currentData = data;
  if (!currentData) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] bg-black/90 backdrop-blur-md select-none overflow-hidden ${
        isClosing ? 'modal-fade-exit' : 'modal-fade-enter'
      }`}
    >
      {/* Top header bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-20 bg-black/40 backdrop-blur-sm border-b border-white/5 pointer-events-auto"
      >
        <div className="flex items-center gap-2 max-w-[70%]">
          <span className="text-[#e9edef] text-sm font-semibold truncate">
            {currentData.title}
          </span>
          <span className="text-[10px] text-[#8696a0] bg-[#202c33] px-2 py-0.5 rounded-full border border-[#2c3943]">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#8696a0] mr-2 hidden sm:inline-block">
            Scroll to zoom • Drag to pan • Esc to close
          </span>
          {zoom > 1 && (
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1.5 text-[#8696a0] hover:text-[#e9edef] rounded-lg bg-[#202c33] hover:bg-[#2a3942] border border-[#2c3943] transition-colors"
              title="Reset Zoom"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 text-[#8696a0] hover:text-[#e9edef] rounded-lg bg-[#202c33] hover:bg-[#2a3942] border border-[#2c3943] transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Zoomable Image Viewport */}
      <div
        ref={imageViewportRef}
        onClick={(e) => {
          if (e.target === e.currentTarget && dragDistanceRef.current < 5) {
            handleClose();
          }
        }}
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
        className={`absolute inset-0 top-14 overflow-hidden flex items-center justify-center select-none ${
          zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
      >
        <img
          src={currentData.url}
          alt={currentData.title}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isDragging ? 'none' : 'transform 0.12s ease-out',
          }}
          className="max-h-[calc(100vh-4rem)] max-w-[calc(100vw-2rem)] object-contain shadow-2xl pointer-events-auto select-none rounded-lg"
        />
      </div>
    </div>
  );
};

