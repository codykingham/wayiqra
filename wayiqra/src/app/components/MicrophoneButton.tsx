'use client';

import type { AppState } from '../types';

interface MicrophoneButtonProps {
  state: AppState;
  onStart: () => void;
  onStop: () => void;
  disabled: boolean;
}

export function MicrophoneButton({ state, onStart, onStop, disabled }: MicrophoneButtonProps) {
  const isActive = state !== 'idle';
  
  return (
    <button
      className={`mic-button ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={isActive ? onStop : onStart}
      disabled={disabled}
      aria-label={isActive ? 'Stop listening' : 'Start listening'}
    >
      <svg 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
        strokeLinecap="round" 
        strokeLinejoin="round"
        className="mic-icon"
      >
        {isActive ? (
          // Stop icon (square)
          <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />
        ) : (
          // Microphone icon
          <>
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </>
        )}
      </svg>
      
      {/* Pulse rings when active */}
      {isActive && (
        <>
          <span className="pulse-ring pulse-ring-1" />
          <span className="pulse-ring pulse-ring-2" />
          <span className="pulse-ring pulse-ring-3" />
        </>
      )}
    </button>
  );
}

