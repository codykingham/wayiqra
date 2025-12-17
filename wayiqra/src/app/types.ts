export interface AudioFeatures {
  id: string;
  index: number;
  filename: string;
  Hebrew: string;
  English: string;
  duration: number;
  // Full MFCC sequence for DTW matching (NEW)
  mfccSequence?: number[][];
  // Kept for backward compatibility
  avgMfcc: number[];
  stdMfcc: number[];
  avgEnergy?: number;
  avgSpectralCentroid?: number;
  avgSpectralFlatness?: number;
}

export interface DisplayedLine {
  id: string;
  Hebrew: string;
  English: string;
  confidence: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  /** True when showing optimistic prediction before match is confirmed */
  isPending?: boolean;
}

export type AppState = 'idle' | 'listening' | 'processing';
