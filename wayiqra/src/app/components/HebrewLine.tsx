'use client';

interface HebrewLineProps {
  hebrew: string;
  english: string;
  isNew: boolean;
  index: number;
}

export function HebrewLine({ hebrew, english, isNew, index }: HebrewLineProps) {
  return (
    <div 
      className={`hebrew-line ${isNew ? 'writing' : ''}`}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <p className="hebrew-text" dir="rtl" lang="he">
        {hebrew}
      </p>
      <p className="english-text">
        {english}
      </p>
      <div className="line-divider" />
    </div>
  );
}

