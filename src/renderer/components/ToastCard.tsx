import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, XCircle, X } from 'lucide-react';
import type { ToastItem } from '../types';

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
  onReopen: (url: string) => void;
}

export const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss, onReopen }) => {
  const isCancelled = toast.message.toLowerCase().includes('cancel');
  const canReopen = Boolean(isCancelled && toast.url);
  const [progress, setProgress] = useState(100);
  const [isHovered, setIsHovered] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number | null>(null);
  const duration = 4500;

  useEffect(() => {
    if (toast.isExiting) return;

    if (isHovered) {
      setProgress(100);
      startTimeRef.current = Date.now();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    startTimeRef.current = Date.now();
    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (elapsed >= duration) {
        onDismiss(toast.id);
      } else {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isHovered, toast.isExiting, toast.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (canReopen && toast.url && !toast.isExiting) {
          onReopen(toast.url);
          onDismiss(toast.id);
        }
      }}
      className={`relative overflow-hidden flex items-center gap-3 p-3.5 bg-[#1f2c34] border ${
        isCancelled ? 'border-[#f15c6d]/40' : 'border-[#00a884]/40'
      } text-[#e9edef] rounded-xl shadow-2xl backdrop-blur-md ${
        toast.isExiting ? 'win10-toast-exit' : 'win10-toast-enter'
      } ${
        canReopen ? 'cursor-pointer hover:bg-[#25323a] hover:border-[#f15c6d]/80 transition-all select-none' : ''
      }`}
      title={canReopen ? 'Click to reopen prompt' : undefined}
    >
      {/* KDE-style Expiration Progress Bar at the Top */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-black/25 overflow-hidden rounded-t-xl">
        <div
          className={`h-full transition-none ${
            isCancelled ? 'bg-[#f15c6d]' : 'bg-[#00a884]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        className={`p-2 ${
          isCancelled ? 'bg-[#f15c6d]/20 text-[#f15c6d]' : 'bg-[#00a884]/20 text-[#00a884]'
        } rounded-lg shrink-0 mt-0.5`}
      >
        {isCancelled ? <XCircle className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight text-[#e9edef]">{toast.message}</p>
        {toast.url && (
          <p className="text-[10px] text-[#8696a0] truncate mt-0.5" title={toast.url}>
            {toast.url}
          </p>
        )}
        {canReopen && (
          <p className="text-[9px] text-[#f15c6d] font-medium mt-1">
            Click to reopen prompt
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        className="text-[#8696a0] hover:text-[#e9edef] transition-colors p-1 rounded-md hover:bg-[#2a3942]"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

