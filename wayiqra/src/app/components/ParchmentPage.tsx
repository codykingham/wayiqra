'use client';

import { useState } from 'react';
import { useAudioMatcher } from '../hooks/useAudioMatcher';

// SVG Icons
const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
);

const ResetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const GearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

export function ParchmentPage() {
  const {
    state,
    currentLine,
    micPermission,
    startListening,
    stopListening,
    reset,
    goPrev,
    goNext,
    totalLines,
  } = useAudioMatcher();
  
  const [showControls, setShowControls] = useState(false);

  return (
    <div className="presentation-container">
      {/* Main content area - full focus on text */}
      <main className="presentation-content">
        {!currentLine ? (
          <div className="empty-state-minimal">
            <p className="waiting-text-hebrew" dir="rtl" lang="he">יְשַׁעְיָהוּ נג</p>
            <p className="waiting-text-english">Isaiah 53</p>
          </div>
        ) : (
          <div className="line-display" key={currentLine.id}>
            <p className="hebrew-text-hero ink-bleed" dir="rtl" lang="he">
              {currentLine.Hebrew}
            </p>
            <p className="english-text-hero ink-bleed-delayed">
              {currentLine.English}
            </p>
          </div>
        )}
      </main>
      
      {/* Minimal control trigger - bottom right */}
      <button 
        className="control-trigger"
        onClick={() => setShowControls(!showControls)}
        aria-label="Toggle controls"
      >
        {state === 'listening' ? (
          <span className="listening-indicator" />
        ) : (
          <GearIcon />
        )}
      </button>
      
      {/* Stamp-style control popup */}
      {showControls && (
        <div className="control-popup">
          <button
            className="control-btn"
            onClick={goPrev}
            disabled={totalLines === 0}
            aria-label="Previous line"
          >
            ←
          </button>
          <button 
            className={`control-btn ${state === 'listening' ? 'active' : ''}`}
            onClick={state === 'listening' ? stopListening : startListening}
            disabled={micPermission === 'denied'}
          >
            {state === 'listening' ? <StopIcon /> : <MicIcon />}
          </button>
          <button
            className="control-btn"
            onClick={goNext}
            disabled={totalLines === 0}
            aria-label="Next line"
          >
            →
          </button>
          <button 
            className="control-btn"
            onClick={reset}
          >
            <ResetIcon />
          </button>
          <button 
            className="control-btn close"
            onClick={() => setShowControls(false)}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
