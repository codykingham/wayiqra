'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Meyda from 'meyda';
import type { DisplayedLine, AppState } from '../types';

/**
 * DTW-based Audio Matcher with Sequential Attention
 * 
 * Uses Dynamic Time Warping to compare MFCC sequences, with a position-aware
 * "attention" mechanism that biases toward the expected next line in sequence.
 * This allows:
 * - Natural sequential reading progression
 * - Repeating the current line (for mispronunciations)
 * - Skipping ahead if DTW evidence is strong enough
 */

// Extended interface to include MFCC sequence for DTW
interface AudioFeaturesDTW {
  id: string;
  index: number;
  filename: string;
  Hebrew: string;
  English: string;
  duration: number;
  mfccSequence: number[][];
  avgMfcc: number[];
  stdMfcc: number[];
}

// =========================================================================
// DTW ALGORITHM
// =========================================================================

function frameDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function normalizeFrame(frame: number[]): number[] {
  const mean = frame.reduce((a, b) => a + b, 0) / frame.length;
  let variance = 0;
  for (const v of frame) {
    variance += (v - mean) ** 2;
  }
  const std = Math.sqrt(variance / frame.length);
  if (std < 0.001) return frame.map(() => 0);
  return frame.map(v => (v - mean) / std);
}

function normalizeSequence(seq: number[][]): number[][] {
  return seq.map(normalizeFrame);
}

function dtwDistance(seq1: number[][], seq2: number[][], bandWidthRatio: number = 0.3): number {
  const n = seq1.length;
  const m = seq2.length;
  
  if (n === 0 || m === 0) return Infinity;
  
  const band = Math.max(
    Math.floor(Math.max(n, m) * bandWidthRatio),
    Math.abs(n - m) + 1
  );
  
  const dtw: number[][] = Array(n + 1).fill(null)
    .map(() => Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;
  
  for (let i = 1; i <= n; i++) {
    const jCenter = Math.round((i / n) * m);
    const jStart = Math.max(1, jCenter - band);
    const jEnd = Math.min(m, jCenter + band);
    
    for (let j = jStart; j <= jEnd; j++) {
      const cost = frameDistance(seq1[i - 1], seq2[j - 1]);
      dtw[i][j] = cost + Math.min(
        dtw[i - 1][j],
        dtw[i][j - 1],
        dtw[i - 1][j - 1]
      );
    }
  }
  
  return dtw[n][m] / (n + m);
}

// =========================================================================
// SEQUENTIAL ATTENTION
// =========================================================================

/**
 * Calculate position penalty based on distance from expected position.
 * 
 * Expected position is currentIndex + 1 (next line).
 * Penalties are LINEAR with distance - this provides consistent, predictable
 * behavior and makes it harder to accidentally jump far away.
 * 
 * A far-away line must have SIGNIFICANTLY better DTW to overcome the penalty.
 */
function calculatePositionPenalty(
  candidateIndex: number,
  currentIndex: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dtwDistance: number
): number {
  const expectedIndex = currentIndex + 1;
  
  // Penalty per line of distance from expected
  // At 0.15 per line, a candidate 5 lines away gets 0.75 penalty
  // This means DTW must be 0.75 better to overcome a 5-line jump
  const PENALTY_PER_LINE = 0.15;
  
  // Small reward for being the next expected line (slight bias forward)
  const NEXT_LINE_BONUS = 0;
  
  // Small penalty for repeating current line (slight bias forward)
  const REPEAT_PENALTY = 0.25;
  
  if (candidateIndex === expectedIndex) {
    // Next line - this is what we expect, slight bonus
    return NEXT_LINE_BONUS;
  } else if (candidateIndex === currentIndex) {
    // Current line (repeat) - small fixed penalty
    // Allows re-reading but prefers moving forward
    return REPEAT_PENALTY;
  } else {
    // Any other line - linear penalty based on distance
    const distanceFromExpected = Math.abs(candidateIndex - expectedIndex);
    return distanceFromExpected * PENALTY_PER_LINE;
  }
}

// =========================================================================
// MAIN HOOK
// =========================================================================

export function useAudioMatcher() {
  const [state, setState] = useState<AppState>('idle');
  const [currentLine, setCurrentLine] = useState<DisplayedLine | null>(null);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeaturesDTW[]>([]);
  const [micPermission, setMicPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [completedLines, setCompletedLines] = useState<Set<string>>(new Set());
  
  // Track current position in the sequence (for attention mechanism)
  const currentPositionRef = useRef<number>(-1);  // -1 means no line matched yet

  // Track last confirmed line separately from optimistic/pending UI.
  const confirmedLineRef = useRef<DisplayedLine | null>(null);

  // If we miss matches repeatedly, widen search to recover when off-track.
  const failureStreakRef = useRef<number>(0);

  // Virtual final line (no audio reference) for end-of-reading.
  const lastRealIndexRef = useRef<number | null>(null);
  const finalVirtualIndexRef = useRef<number | null>(null);
  const FINAL_LINE_ID = 'final';
  const FINAL_HEBREW = 'זֶה הַדָּבָר יְהוָה׃';
  const FINAL_ENGLISH = 'This is the word of the LORD.';
  
  // Pre-normalized reference sequences
  const normalizedRefsRef = useRef<{ id: string; feature: AudioFeaturesDTW; normalizedSeq: number[][] }[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meydaAnalyzerRef = useRef<any>(null);
  const isActiveRef = useRef<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Frame collection for DTW
  const mfccFramesRef = useRef<number[][]>([]);
  const energyFramesRef = useRef<number[]>([]);
  
  // Speech detection
  const isSpeakingRef = useRef<boolean>(false);
  const silenceCountRef = useRef<number>(0);
  const speechStartTimeRef = useRef<number>(0);
  const lastPhraseEndRef = useRef<number>(0);
  const speechFramesInARowRef = useRef<number>(0);
  const optimisticTimerRef = useRef<number | null>(null);
  const listeningStartTimeRef = useRef<number>(0);

  // Adaptive energy threshold (reduces sensitivity to background noise).
  const noiseFloorRef = useRef<number>(0.002);
  
  const matchAttemptRef = useRef<number>(0);
  
  // Constants
  const ENERGY_THRESHOLD_MIN = 0.004; // absolute floor
  const ENERGY_NOISE_EMA_ALPHA = 0.05;
  const ENERGY_MULTIPLIER = 3.2; // threshold = max(min, noiseFloor * multiplier)
  const SILENCE_FRAMES_TO_END = 12;
  const MIN_SPEECH_FRAMES = 15;
  const START_SPEECH_FRAMES = 2; // debounce "speech started" to reduce false starts
  const PHRASE_COOLDOWN_MS = 200; // Wait before detecting new speech
  const OPTIMISTIC_UI_DELAY_MS = 120; // show expected line shortly after speech starts (more stable than immediate)
  const LISTENING_WARMUP_MS = 600; // ignore matching during mic warmup to avoid initial pops/noise
  
  // DTW parameters
  const DURATION_FILTER_WINDOW = 1.5;
  const DTW_BAND_WIDTH = 0.3;
  
  const isConfidentFinalSpeech = useCallback((speechDurationMs: number) => {
    // We only want to trigger the terminal line on *real* speech.
    const frames = mfccFramesRef.current.length;
    if (frames < MIN_SPEECH_FRAMES) return false;
    if (speechDurationMs < 350) return false;

    const energies = energyFramesRef.current;
    const avgEnergy = energies.length
      ? energies.reduce((a, b) => a + b, 0) / energies.length
      : 0;

    const dynamicThreshold = Math.max(ENERGY_THRESHOLD_MIN, noiseFloorRef.current * ENERGY_MULTIPLIER);
    return avgEnergy > dynamicThreshold * 1.25;
  }, [MIN_SPEECH_FRAMES, ENERGY_MULTIPLIER, ENERGY_THRESHOLD_MIN]);

  useEffect(() => {
    console.log('[Wayiqra] Loading audio features for DTW with sequential attention...');
    fetch('/audio-features.json')
      .then(res => res.json())
      .then((data: AudioFeaturesDTW[]) => {
        data.sort((a, b) => a.index - b.index);
        console.log(`[Wayiqra] Loaded ${data.length} lines`);
        
        if (data.length > 0 && data[0].mfccSequence) {
          console.log('[Wayiqra] ✓ Features include MFCC sequences for DTW');
          const totalFrames = data.reduce((sum, d) => sum + d.mfccSequence.length, 0);
          console.log(`[Wayiqra] Total reference frames: ${totalFrames}`);
        } else {
          console.warn('[Wayiqra] ⚠️ Features missing mfccSequence - re-run extraction!');
        }
        
        // Append a virtual terminal line (no DTW ref). We'll "match" it when we reach the end
        // and detect confident speech, without requiring an audio track.
        const lastRealIndex = data.length - 1;
        const virtualFinalIndex = data.length;
        if (lastRealIndex >= 0) {
          lastRealIndexRef.current = lastRealIndex;
          finalVirtualIndexRef.current = virtualFinalIndex;
          data.push({
            id: FINAL_LINE_ID,
            index: virtualFinalIndex,
            filename: '',
            Hebrew: FINAL_HEBREW,
            English: FINAL_ENGLISH,
            duration: 0,
            mfccSequence: [],
            avgMfcc: [],
            stdMfcc: [],
          });
        }

        const normalizedRefs = data.map(d => {
          const normalizedSeq = d.mfccSequence ? normalizeSequence(d.mfccSequence) : [];
          return { id: d.id, feature: d, normalizedSeq };
        });
        normalizedRefsRef.current = normalizedRefs;
        
        console.log(`[Wayiqra] Pre-normalized ${normalizedRefs.length} reference sequences`);
        console.log('[Wayiqra] Sequential attention enabled - expecting lines in order');
        
        setAudioFeatures(data);
      })
      .catch(err => console.error('[Wayiqra] Failed to load:', err));
    
    if (typeof window !== 'undefined' && !navigator.mediaDevices?.getUserMedia) {
      setMicPermission('denied');
    }
  }, []);
  
  const findBestMatch = useCallback((speechDurationMs: number): { 
    match: AudioFeaturesDTW; 
    similarity: number;
    margin: number;
    confidenceLevel: 'high' | 'medium' | 'low';
  } | null => {
    const frames = mfccFramesRef.current;
    const normalizedRefs = normalizedRefsRef.current;
    const speechDurationSec = speechDurationMs / 1000;
    const currentPosition = currentPositionRef.current;
    
    if (normalizedRefs.length === 0 || frames.length < MIN_SPEECH_FRAMES) {
      console.log(`[Wayiqra] Not enough data: ${frames.length} frames, ${normalizedRefs.length} refs`);
      return null;
    }
    
    // Build and normalize input sequence
    const inputSequence: number[][] = frames.map(frame => frame.slice(1, 13));
    const normalizedInput = normalizeSequence(inputSequence);
    
    matchAttemptRef.current++;
    const expectedNext = currentPosition + 1;
    console.log(`[Wayiqra] DTW Match attempt #${matchAttemptRef.current}`);
    console.log(`[Wayiqra] Input: ${inputSequence.length} frames, ${speechDurationSec.toFixed(2)}s`);
    console.log(`[Wayiqra] Current position: ${currentPosition}, expecting: ${expectedNext}`);
    
    // ADAPTIVE SEQUENTIAL MODE:
    // - Prefer expectedNext (current+1)
    // - Allow additional candidates within a widening window to recover when off-track
    // - Penalize distance from expectedNext linearly (see calculatePositionPenalty)
    const baseRadius = 3;
    const extraRadius = Math.min(8, failureStreakRef.current); // widen on repeated failures
    const radius = Math.min(10, baseRadius + extraRadius);
    const expectedIndex = Math.max(0, Math.min(normalizedRefs.length - 1, expectedNext));
    const start = Math.max(0, expectedIndex - radius);
    const end = Math.min(normalizedRefs.length - 1, expectedIndex + radius);

    const candidateSet = new Set<number>();
    for (let i = start; i <= end; i++) candidateSet.add(i);
    if (currentPosition >= 0) candidateSet.add(currentPosition); // ensure repeat is always possible
    if (currentPosition - 1 >= 0) candidateSet.add(currentPosition - 1); // allow a small backstep
    if (expectedIndex >= 0) candidateSet.add(expectedIndex);

    const candidateIndices = Array.from(candidateSet).sort((a, b) => a - b);
    
    const scores: { 
      id: string; 
      feature: AudioFeaturesDTW; 
      dtwDist: number;
      penalty: number;
      combined: number;
      label: string;
    }[] = [];
    
    for (const idx of candidateIndices) {
      const ref = normalizedRefs[idx];
      if (!ref?.normalizedSeq || ref.normalizedSeq.length === 0) continue;
      
      const dtwDist = dtwDistance(ref.normalizedSeq, normalizedInput, DTW_BAND_WIDTH);
      const isNext = idx === expectedIndex;
      const isCurr = idx === currentPosition;
      const direction = idx < expectedIndex ? '←' : idx > expectedIndex ? '→' : '·';
      const label = isNext ? '→NEXT' : isCurr ? '↻CURR' : `${direction}${idx - expectedIndex}`;

      const positionPenalty = calculatePositionPenalty(idx, currentPosition, dtwDist);

      // Light duration penalty helps reject wildly mismatched phrases without hard-filtering.
      const refDuration = Math.max(0.05, ref.feature.duration || 0);
      const durationDiff = Math.abs(refDuration - speechDurationSec);
      const durationPenalty = Math.min(0.6, Math.max(0, (durationDiff - DURATION_FILTER_WINDOW)) * 0.25);

      const penalty = positionPenalty + durationPenalty;
      
      scores.push({ 
        id: ref.id, 
        feature: ref.feature, 
        dtwDist,
        penalty,
        combined: dtwDist + penalty,
        label
      });
    }
    
    console.log(`[Wayiqra] Adaptive mode: comparing ${scores.length} candidates (radius=${radius}, failures=${failureStreakRef.current})`);
    
    if (scores.length === 0) {
      console.log('[Wayiqra] No candidates available');
      return null;
    }
    
    // Sort by combined score (DTW + position penalty)
    scores.sort((a, b) => a.combined - b.combined);
    
    // Log all candidates
    console.log(`[Wayiqra] Candidates (DTW + penalty):`);
    for (const s of scores) {
      console.log(`  ${s.id} [${s.label}]: dtw=${s.dtwDist.toFixed(3)} + pen=${s.penalty.toFixed(1)} = ${s.combined.toFixed(3)}`);
    }
    
    const best = scores[0];
    const second = scores[1];
    const margin = second ? (second.combined - best.combined) : best.combined;
    const relativeMargin = second ? margin / Math.max(1e-6, best.combined) : 1;
    
    console.log(`[Wayiqra] Best: ${best.id} [${best.label}], combined=${best.combined.toFixed(3)}, margin=${margin.toFixed(3)} (${(relativeMargin * 100).toFixed(0)}%)`);
    
    // Confidence based on combined score and margin
    let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
    
    if (best.combined < 1.15 && relativeMargin > 0.10) {
      confidenceLevel = 'high';
    } else if (best.combined < 1.65 && relativeMargin > 0.06) {
      confidenceLevel = 'medium';
    }
    
    const similarity = Math.max(0, Math.min(1, 1 - best.combined / 2));
    
    // SAFETY GATE: don't advance on weak evidence.
    // This reduces "drift" and prevents the system from walking off track.
    const isExpected = best.feature.index === expectedIndex;
    const HARD_ACCEPT = best.combined < 1.05;
    const SOFT_ACCEPT = confidenceLevel !== 'low';
    const NEXT_LINE_BIAS_ACCEPT = isExpected && best.combined < 1.45 && relativeMargin > 0.04;
    const accept = HARD_ACCEPT || SOFT_ACCEPT || NEXT_LINE_BIAS_ACCEPT;

    console.log(`[Wayiqra] ${accept ? 'Accepting' : 'Rejecting'} best candidate (confidence=${confidenceLevel}, expected=${isExpected})`);
    if (!accept) return null;
    
    return { 
      match: best.feature, 
      similarity, 
      margin: relativeMargin,
      confidenceLevel 
    };
  }, []);

  const goToIndex = useCallback((targetIndex: number) => {
    const refs = normalizedRefsRef.current;
    if (!refs.length) return;
    const clamped = Math.max(0, Math.min(refs.length - 1, targetIndex));
    const ref = refs[clamped];
    if (!ref) return;

    const line: DisplayedLine = {
      id: ref.feature.id,
      Hebrew: ref.feature.Hebrew,
      English: ref.feature.English,
      confidence: 1,
      confidenceLevel: 'high',
      isPending: false,
    };

    // Treat manual navigation as "confirmed display" (no DTW match performed).
    currentPositionRef.current = ref.feature.index;
    failureStreakRef.current = 0;
    confirmedLineRef.current = line;
    setCurrentLine(line);
  }, []);

  const goPrev = useCallback(() => {
    const cur = currentPositionRef.current;
    if (cur <= 0) return;
    goToIndex(cur - 1);
  }, [goToIndex]);

  const goNext = useCallback(() => {
    const refs = normalizedRefsRef.current;
    if (!refs.length) return;
    const cur = currentPositionRef.current;
    const next = cur < 0 ? 0 : cur + 1;
    if (next > refs.length - 1) return;
    goToIndex(next);
  }, [goToIndex]);

  const goTitle = useCallback(() => {
    // Return to "title" view without resetting progress or matcher position.
    // Clear the confirmed line so rejects don't auto-pop back to the last line.
    confirmedLineRef.current = null;
    setCurrentLine(null);
  }, []);
  
  const processPhrase = useCallback((speechDurationMs: number) => {
    console.log(`[Wayiqra] Processing phrase (${mfccFramesRef.current.length} frames)...`);

    // Special case: when we've matched the last *real* audio line, the next expected line
    // is the virtual terminal line. If there's confident speech, display it immediately.
    const lastRealIndex = lastRealIndexRef.current;
    const finalVirtualIndex = finalVirtualIndexRef.current;
    if (
      lastRealIndex !== null &&
      finalVirtualIndex !== null &&
      currentPositionRef.current === lastRealIndex &&
      isConfidentFinalSpeech(speechDurationMs)
    ) {
      const confirmed: DisplayedLine = {
        id: FINAL_LINE_ID,
        Hebrew: FINAL_HEBREW,
        English: FINAL_ENGLISH,
        confidence: 1,
        confidenceLevel: 'high',
        isPending: false,
      };

      console.log('[Wayiqra] ✓ FINAL LINE triggered (virtual, no audio ref)');
      failureStreakRef.current = 0;
      currentPositionRef.current = finalVirtualIndex;
      confirmedLineRef.current = confirmed;
      setCompletedLines(prev => new Set(prev).add(FINAL_LINE_ID));
      setCurrentLine(confirmed);

      // Clear buffers
      mfccFramesRef.current = [];
      energyFramesRef.current = [];
      silenceCountRef.current = 0;
      speechFramesInARowRef.current = 0;
      return;
    }
    
    const result = findBestMatch(speechDurationMs);
    
    // Clear buffers
    mfccFramesRef.current = [];
    energyFramesRef.current = [];
    silenceCountRef.current = 0;
    speechFramesInARowRef.current = 0;
    
    if (result) {
      failureStreakRef.current = 0;
      const emoji = result.confidenceLevel === 'high' ? '✓' : 
                    result.confidenceLevel === 'medium' ? '~' : '?';
      console.log(`[Wayiqra] ${emoji} MATCHED: ${result.match.id} (${result.confidenceLevel} confidence)`);
      
      // Update sequence position ONLY on accepted match
      currentPositionRef.current = result.match.index;
      setCompletedLines(prev => new Set(prev).add(result.match.id));
      
      const confirmed: DisplayedLine = {
        id: result.match.id,
        Hebrew: result.match.Hebrew,
        English: result.match.English,
        confidence: result.similarity,
        confidenceLevel: result.confidenceLevel,
        isPending: false,
      };
      confirmedLineRef.current = confirmed;

      // Only update UI if match differs from what's displayed
      setCurrentLine(prev => {
        if (prev?.id === result.match.id) {
          console.log(`[Wayiqra] Same as displayed - no UI change`);
          return { ...prev, isPending: false, confidence: result.similarity };
        }
        console.log(`[Wayiqra] Different from displayed - updating UI`);
        return confirmed;
      });
    } else {
      failureStreakRef.current = Math.min(20, failureStreakRef.current + 1);
      console.log(`[Wayiqra] ✗ No match found - keeping current display`);
      // Revert any optimistic/pending UI back to last confirmed line.
      setCurrentLine(() => confirmedLineRef.current);
    }
  }, [findBestMatch, isConfidentFinalSpeech]);
  
  const startListening = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicPermission('denied');
        return;
      }
      
      console.log('[Wayiqra] Starting DTW matcher with sequential attention...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: false, 
          noiseSuppression: false, 
          autoGainControl: false 
        } 
      });
      
      streamRef.current = stream;
      setMicPermission('granted');
      isActiveRef.current = true;
      listeningStartTimeRef.current = Date.now();
      
      // Reset state
      mfccFramesRef.current = [];
      energyFramesRef.current = [];
      isSpeakingRef.current = false;
      silenceCountRef.current = 0;
      speechStartTimeRef.current = 0;
      speechFramesInARowRef.current = 0;
      // Don't reset currentPositionRef - allows resuming where you left off
      
      audioContextRef.current = new AudioContext();
      console.log(`[Wayiqra] Sample rate: ${audioContextRef.current.sampleRate}Hz`);
      console.log(`[Wayiqra] Current position: ${currentPositionRef.current}, will expect line ${currentPositionRef.current + 1}`);
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      meydaAnalyzerRef.current = (Meyda as any).createMeydaAnalyzer({
        audioContext: audioContextRef.current,
        source: source,
        bufferSize: 2048,
        featureExtractors: ['mfcc', 'energy'],
        numberOfMFCCCoefficients: 13,
        callback: (features: { mfcc?: number[] | null; energy?: number }) => {
          if (!isActiveRef.current) return;
          
          const energy = features.energy || 0;
          // Update noise floor when we're not speaking (or in cooldown).
          if (!isSpeakingRef.current) {
            noiseFloorRef.current =
              (1 - ENERGY_NOISE_EMA_ALPHA) * noiseFloorRef.current +
              ENERGY_NOISE_EMA_ALPHA * energy;
          }

          const dynamicThreshold = Math.max(ENERGY_THRESHOLD_MIN, noiseFloorRef.current * ENERGY_MULTIPLIER);
          const now = Date.now();
          
          // Warmup: let levels settle, learn noise floor, and avoid false "speech started".
          if ((now - listeningStartTimeRef.current) < LISTENING_WARMUP_MS) {
            speechFramesInARowRef.current = 0;
            return;
          }

          // Check cooldown - ignore speech right after a phrase ended
          const inCooldown = (now - lastPhraseEndRef.current) < PHRASE_COOLDOWN_MS;

          // Only treat as speech if we have MFCCs AND sustained energy above threshold.
          // This prevents "phantom speech" from energy spikes without usable audio frames.
          const hasMfcc = !!features.mfcc && features.mfcc.length > 0;
          const hasSpeechEnergy = energy > dynamicThreshold;
          const speechLike = hasMfcc && hasSpeechEnergy && !inCooldown;
          
          if (speechLike) {
            silenceCountRef.current = 0;
            speechFramesInARowRef.current++;
            
            if (!isSpeakingRef.current && speechFramesInARowRef.current >= START_SPEECH_FRAMES) {
              isSpeakingRef.current = true;
              speechStartTimeRef.current = now;
              mfccFramesRef.current = [];
              energyFramesRef.current = [];
              console.log(`[Wayiqra] Speech started (threshold=${dynamicThreshold.toFixed(4)}, noise=${noiseFloorRef.current.toFixed(4)})`);
              
              // OPTIMISTIC UI: show expected next line, but slightly delayed for stability.
              if (optimisticTimerRef.current) {
                window.clearTimeout(optimisticTimerRef.current);
                optimisticTimerRef.current = null;
              }
              optimisticTimerRef.current = window.setTimeout(() => {
                if (!isActiveRef.current || !isSpeakingRef.current) return;
                const expectedIdx = Math.max(0, currentPositionRef.current + 1);
                const expectedRef = normalizedRefsRef.current[expectedIdx];
                if (!expectedRef) return;
                setCurrentLine(prev => {
                  if (prev?.id === expectedRef.id && prev.isPending) return prev;
                  return {
                    id: expectedRef.feature.id,
                    Hebrew: expectedRef.feature.Hebrew,
                    English: expectedRef.feature.English,
                    confidence: 0.8,
                    isPending: true,
                  };
                });
              }, OPTIMISTIC_UI_DELAY_MS);
            }
            
            if (features.mfcc) {
              mfccFramesRef.current.push([...features.mfcc]);
              energyFramesRef.current.push(energy);
            }
          } else if (isSpeakingRef.current) {
            silenceCountRef.current++;
            speechFramesInARowRef.current = 0;
            
            if (silenceCountRef.current <= 2 && features.mfcc) {
              mfccFramesRef.current.push([...features.mfcc]);
              energyFramesRef.current.push(energy);
            }
            
            if (silenceCountRef.current >= SILENCE_FRAMES_TO_END) {
              const speechDuration = now - speechStartTimeRef.current;
              console.log(`[Wayiqra] Phrase ended (${speechDuration}ms, ${mfccFramesRef.current.length} frames)`);
              
              isSpeakingRef.current = false;
              lastPhraseEndRef.current = now; // Start cooldown

              if (optimisticTimerRef.current) {
                window.clearTimeout(optimisticTimerRef.current);
                optimisticTimerRef.current = null;
              }
              
              if (mfccFramesRef.current.length >= MIN_SPEECH_FRAMES) {
                processPhrase(speechDuration);
              } else {
                console.log(`[Wayiqra] Too short (${mfccFramesRef.current.length} < ${MIN_SPEECH_FRAMES}), ignoring`);
                mfccFramesRef.current = [];
                energyFramesRef.current = [];
                // Revert optimistic UI if we didn't really get a phrase.
                setCurrentLine(() => confirmedLineRef.current);
              }
              
              silenceCountRef.current = 0;
            }
          } else {
            // Not speaking and no speech - reset debounce counter
            speechFramesInARowRef.current = 0;
          }
        },
      });
      
      meydaAnalyzerRef.current.start();
      setState('listening');
      console.log('[Wayiqra] Listening with DTW + sequential attention...');
      
    } catch (err) {
      console.error('[Wayiqra] Error:', err);
      setMicPermission('denied');
    }
  }, [processPhrase]);
  
  const stopListening = useCallback(() => {
    isActiveRef.current = false;
    
    meydaAnalyzerRef.current?.stop();
    meydaAnalyzerRef.current = null;
    
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    
    audioContextRef.current?.close();
    audioContextRef.current = null;
    
    mfccFramesRef.current = [];
    energyFramesRef.current = [];
    isSpeakingRef.current = false;
    silenceCountRef.current = 0;
    speechFramesInARowRef.current = 0;

    if (optimisticTimerRef.current) {
      window.clearTimeout(optimisticTimerRef.current);
      optimisticTimerRef.current = null;
    }
    
    setState('idle');
  }, []);
  
  const reset = useCallback(() => {
    stopListening();
    setCurrentLine(null);
    confirmedLineRef.current = null;
    setCompletedLines(new Set());
    matchAttemptRef.current = 0;
    currentPositionRef.current = -1;  // Reset position to start
    failureStreakRef.current = 0;
    console.log('[Wayiqra] Reset - position back to start');
  }, [stopListening]);
  
  return {
    state,
    currentLine,
    completedCount: completedLines.size,
    micPermission,
    startListening,
    stopListening,
    reset,
    goPrev,
    goNext,
    goTitle,
    totalLines: audioFeatures.length,
  };
}
