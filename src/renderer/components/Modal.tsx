import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ModalProps {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerIcon?: React.ReactNode;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  backdropClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  disableClose?: boolean;
  role?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  customCard?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  id,
  isOpen,
  onClose,
  children,
  title,
  subtitle,
  headerIcon,
  headerAction,
  footer,
  className = '',
  backdropClassName = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  disableClose = false,
  role = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  customCard = false,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const closingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const modalId = id || 'modal';

  // Synchronize modal state with main process to ensure WebContentsView (WhatsApp) is hidden while modal is displayed
  useEffect(() => {
    if (isOpen) {
      window.electronAPI?.toggleModal?.(true, modalId);
    }
    return () => {
      window.electronAPI?.toggleModal?.(false, modalId);
    };
  }, [isOpen, modalId]);

  // Trap keyboard focus when modal is open and active
  useFocusTrap(modalContainerRef, isOpen && !isClosing);

  // Close with exit animation
  const handleClose = useCallback(() => {
    if (disableClose || isClosing) return;
    setIsClosing(true);
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    closingTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      window.electronAPI?.toggleModal?.(false, modalId);
      onClose();
    }, 180);
  }, [disableClose, isClosing, onClose, modalId]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || isClosing || !closeOnEscape || disableClose) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isClosing, closeOnEscape, disableClose, handleClose]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
      }
      window.electronAPI?.toggleModal?.(false, modalId);
    };
  }, [modalId]);

  if (!isOpen && !isClosing) return null;

  const titleId = ariaLabelledBy || (title && typeof title === 'string' ? `modal-title-${modalId}` : undefined);

  // Default backdrop styling: dark backdrop blur centered
  const defaultBackdropClass = `fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none font-sans p-4 ${
    isClosing ? 'win10-backdrop-exit' : 'win10-backdrop-enter'
  }`;

  const appliedBackdropClass = backdropClassName
    ? `${backdropClassName} ${isClosing ? 'win10-backdrop-exit' : 'win10-backdrop-enter'}`
    : defaultBackdropClass;

  // Default card styling: matches WAllie's dark theme
  const defaultCardClass = `bg-[#202c33] border border-[#2c3943] w-full max-w-lg rounded-2xl shadow-2xl p-6 flex flex-col max-h-[90vh] overflow-hidden ${
    isClosing ? 'win10-window-exit' : 'win10-window-enter'
  }`;

  const appliedCardClass = className ? `${className} ${isClosing ? 'win10-window-exit' : 'win10-window-enter'}` : defaultCardClass;

  return (
    <div
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && closeOnBackdropClick && !disableClose) {
          handleClose();
        }
      }}
      className={appliedBackdropClass}
    >
      {customCard ? (
        <div ref={modalContainerRef} className="w-full h-full flex flex-col items-center justify-center">
          {children}
        </div>
      ) : (
        <div ref={modalContainerRef} className={appliedCardClass}>
          {/* Header */}
          {(title || headerIcon || showCloseButton || headerAction) && (
            <div className={`flex items-center justify-between pb-3 border-b border-[#222d34]/60 shrink-0 ${headerClassName}`}>
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                {headerIcon}
                <div className="min-w-0">
                  {title && (
                    <h3 id={titleId} className="text-sm font-semibold text-[#e9edef] truncate">
                      {title}
                    </h3>
                  )}
                  {subtitle && (
                    <p className="text-[11px] text-[#8696a0] mt-0.5 truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {headerAction}
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={disableClose}
                    className="p-1 rounded-lg text-[#8696a0] hover:text-[#e9edef] hover:bg-[#182229] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Close"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Body Content */}
          <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className={`pt-3 border-t border-[#222d34]/60 shrink-0 ${footerClassName}`}>
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
