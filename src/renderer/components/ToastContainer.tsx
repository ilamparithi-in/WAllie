import React from 'react';
import type { ToastItem } from '../types';
import { ToastCard } from './ToastCard';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
  onReopen: (url: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss, onReopen }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-auto">
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onReopen={onReopen}
        />
      ))}
    </div>
  );
};

