import React, { useEffect, useId } from 'react';
import { WifiOff, RotateCw, ShieldAlert } from 'lucide-react';
import type { WebErrorDetails } from '../../preload';

interface BrowserErrorViewProps {
  error: WebErrorDetails;
  isRetrying?: boolean;
  onRetry: () => void;
  onLoadHome: () => void;
}

export const BrowserErrorView: React.FC<BrowserErrorViewProps> = ({
  error,
  isRetrying = false,
  onRetry,
  onLoadHome,
}) => {
  const headingId = useId();

  const isCertError =
    error.errorDescription?.includes('ERR_CERT_') ||
    error.errorDescription?.includes('ERR_SSL_');

  const isLogoutOrDeepUrl = Boolean(
    error.validatedURL &&
    (error.validatedURL.includes('post_logout=') ||
      error.validatedURL.includes('logout_reason=') ||
      (error.validatedURL !== 'https://web.whatsapp.com' &&
        error.validatedURL !== 'https://web.whatsapp.com/'))
  );

  // Silently retry as soon as network connectivity is restored
  useEffect(() => {
    const handleOnline = () => {
      onRetry();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [onRetry]);

  // Keyboard shortcut listener: F5 or Ctrl+R to retry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F5' ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))
      ) {
        e.preventDefault();
        onRetry();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRetry]);

  const IconComponent = isCertError ? ShieldAlert : WifiOff;

  const errorMessage = isCertError
    ? 'A secure connection could not be established. Check your system date and time settings.'
    : error.errorDescription?.includes('ERR_NAME_NOT_RESOLVED')
      ? 'The server could not be reached. Check your internet connection or DNS settings.'
      : 'Make sure your computer has an active internet connection.';

  return (
    <section
      role="alert"
      aria-labelledby={headingId}
      className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[#111b21] text-[#e9edef] select-none"
    >
      <div className="flex flex-col items-center text-center max-w-sm">
        <IconComponent
          className="w-12 h-12 text-[#8696a0] mb-5"
          aria-hidden="true"
        />

        <h2
          id={headingId}
          className="text-base font-normal text-[#e9edef] mb-2 tracking-normal"
        >
          {isCertError ? 'Security Connection Error' : "Can't connect to WhatsApp Web"}
        </h2>

        <p className="text-xs text-[#8696a0] mb-1.5 leading-relaxed">
          {errorMessage}
        </p>

        {error.errorDescription && (
          <p className="text-[11px] text-[#8696a0]/70 font-mono mb-6">
            {error.errorDescription} {error.errorCode ? `(${error.errorCode})` : ''}
          </p>
        )}

        <div className="flex flex-col items-center gap-3 w-full">
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="w-full max-w-[160px] h-9 px-4 bg-[#00a884] hover:bg-[#00c298] disabled:opacity-50 text-[#111b21] font-medium text-xs rounded transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
          >
            {isRetrying && <RotateCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
          </button>

          {isLogoutOrDeepUrl && (
            <button
              type="button"
              onClick={onLoadHome}
              disabled={isRetrying}
              className="text-xs text-[#00a884] hover:underline font-normal transition-colors focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
            >
              Go to WhatsApp Web home
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
