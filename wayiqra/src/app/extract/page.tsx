'use client';

import { useState, useCallback, useRef } from 'react';
import Meyda from 'meyda';
import { audioMetadata } from '../audio_metadata';

interface ExtractedFeature {
  id: string;
  index: number;
  filename: string;
  Hebrew: string;
  English: string;
  duration: number;
  avgMfcc: number[];
  stdMfcc: number[];
}

/**
 * Browser Feature Extraction using IDENTICAL pipeline as live matcher.
 * 
 * Uses createMeydaAnalyzer with AudioBufferSourceNode to ensure
 * windowing, sample processing, and MFCC extraction are identical
 * to what happens with live microphone input.
 */
export default function ExtractPage() {
  const [status, setStatus] = useState<string>('Ready to extract');
  const [progress, setProgress] = useState<number>(0);
  const [features, setFeatures] = useState<ExtractedFeature[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const abortRef = useRef(false);

  const extractSingleFile = useCallback(async (
    filename: string,
    index: number,
    Hebrew: string,
    English: string
  ): Promise<ExtractedFeature | null> => {
    return new Promise(async (resolve) => {
      try {
        const id = filename.replace('.wav', '');
        
        // Load audio file
        const response = await fetch(`/audio/${filename}`);
        if (!response.ok) {
          console.error(`[Extract] Failed to fetch ${filename}: ${response.status}`);
          resolve(null);
          return;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Create AudioContext (use standard sample rate)
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration;
        
        console.log(`[Extract] ${id}: ${duration.toFixed(2)}s, ${audioContext.sampleRate}Hz`);
        
        // Collect MFCC frames using the SAME analyzer as live input
        const mfccFrames: number[][] = [];
        
        // Create source node for the audio file
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Create Meyda analyzer with IDENTICAL settings to useAudioMatcher
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const analyzer = (Meyda as any).createMeydaAnalyzer({
          audioContext: audioContext,
          source: source,
          bufferSize: 2048,  // Same as live matcher
          featureExtractors: ['mfcc', 'energy'],
          numberOfMFCCCoefficients: 13,  // Same as live matcher
          callback: (features: { mfcc?: number[] | null; energy?: number }) => {
            if (features.mfcc && features.energy && features.energy > 0.001) {
              // Only collect frames with some energy (like live does with speech detection)
              mfccFrames.push([...features.mfcc]);
            }
          },
        });
        
        // Start analyzer and play the audio
        analyzer.start();
        source.connect(audioContext.destination);
        source.start(0);
        
        // Wait for playback to complete
        await new Promise<void>((playbackResolve) => {
          source.onended = () => {
            // Give a tiny bit extra time for final frames
            setTimeout(() => {
              playbackResolve();
            }, 100);
          };
        });
        
        analyzer.stop();
        
        console.log(`[Extract] ${id}: collected ${mfccFrames.length} frames`);
        
        if (mfccFrames.length < 10) {
          console.error(`[Extract] ${id}: Not enough frames!`);
          await audioContext.close();
          resolve(null);
          return;
        }
        
        // Compute average MFCC
        const numCoeffs = 13;
        const avgMfcc: number[] = new Array(numCoeffs).fill(0);
        for (const frame of mfccFrames) {
          for (let c = 0; c < numCoeffs; c++) {
            avgMfcc[c] += frame[c];
          }
        }
        for (let c = 0; c < numCoeffs; c++) {
          avgMfcc[c] /= mfccFrames.length;
        }
        
        // Compute std MFCC
        const stdMfcc: number[] = new Array(numCoeffs).fill(0);
        for (const frame of mfccFrames) {
          for (let c = 0; c < numCoeffs; c++) {
            stdMfcc[c] += (frame[c] - avgMfcc[c]) ** 2;
          }
        }
        for (let c = 0; c < numCoeffs; c++) {
          stdMfcc[c] = Math.sqrt(stdMfcc[c] / mfccFrames.length);
        }
        
        console.log(`[Extract] ${id}: avgMfcc[1:5] = [${avgMfcc.slice(1, 5).map(v => v.toFixed(2)).join(', ')}]`);
        
        await audioContext.close();
        
        resolve({
          id,
          index,
          filename,
          Hebrew,
          English,
          duration,
          avgMfcc,
          stdMfcc,
        });
      } catch (err) {
        console.error(`[Extract] Failed to process:`, err);
        resolve(null);
      }
    });
  }, []);

  const extractFeatures = useCallback(async () => {
    setIsExtracting(true);
    abortRef.current = false;
    setStatus('Starting extraction (playing audio through analyzer)...');
    const extracted: ExtractedFeature[] = [];

    for (let i = 0; i < audioMetadata.length; i++) {
      if (abortRef.current) {
        setStatus('Aborted');
        break;
      }
      
      const item = audioMetadata[i];
      const filename = item.path.split('/').pop() || '';
      const id = filename.replace('.wav', '');
      
      setStatus(`Processing ${id} (${i + 1}/${audioMetadata.length})... This plays through the analyzer.`);
      setProgress((i / audioMetadata.length) * 100);

      const result = await extractSingleFile(filename, i, item.Hebrew, item.English);
      if (result) {
        extracted.push(result);
      }
      
      // Small delay between files to let browser settle
      await new Promise(r => setTimeout(r, 200));
    }

    setFeatures(extracted);
    setProgress(100);
    setStatus(`Done! Extracted ${extracted.length} features. Copy the JSON below and save to public/audio-features.json`);
    setIsExtracting(false);
  }, [extractSingleFile]);

  const abortExtraction = useCallback(() => {
    abortRef.current = true;
  }, []);

  return (
    <div style={{ 
      padding: '40px 20px', 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      maxWidth: '800px', 
      margin: '0 auto',
      lineHeight: 1.6,
      color: '#1a1a1a'
    }}>
      <h1 style={{ 
        fontSize: '28px', 
        fontWeight: 600, 
        marginBottom: '24px',
        color: '#111'
      }}>
        Browser Feature Extraction
      </h1>
      
      <div style={{ 
        background: '#fffbeb', 
        border: '1px solid #f59e0b', 
        padding: '20px', 
        borderRadius: '12px',
        marginBottom: '28px',
        fontSize: '15px'
      }}>
        <p style={{ margin: '0 0 12px 0', fontWeight: 500 }}>
          ⚠️ Why does this exist?
        </p>
        <p style={{ margin: '0 0 12px 0', color: '#525252' }}>
          The live matcher uses the browser&apos;s Web Audio API via <code style={{ 
            background: '#f3f4f6', 
            padding: '2px 6px', 
            borderRadius: '4px',
            fontSize: '13px'
          }}>createMeydaAnalyzer</code>. 
          Node.js doesn&apos;t have Web Audio, so a script would produce different MFCC values. 
          This page extracts features using the <strong>exact same pipeline</strong> as live input.
        </p>
        <p style={{ margin: 0, color: '#525252' }}>
          <strong>Note:</strong> You&apos;ll hear the audio files play — this is expected! Takes ~2 minutes.
        </p>
      </div>
      
      <div style={{ marginBottom: '28px', display: 'flex', gap: '12px' }}>
        <button 
          onClick={extractFeatures} 
          disabled={isExtracting}
          style={{ 
            padding: '14px 28px', 
            fontSize: '16px',
            fontWeight: 500,
            background: isExtracting ? '#d1d5db' : '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isExtracting ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s'
          }}
        >
          {isExtracting ? 'Extracting...' : 'Start Extraction'}
        </button>
        
        {isExtracting && (
          <button 
            onClick={abortExtraction}
            style={{ 
              padding: '14px 28px', 
              fontSize: '16px',
              fontWeight: 500,
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Stop
          </button>
        )}
      </div>

      <div style={{ marginBottom: '20px', fontSize: '15px' }}>
        <span style={{ fontWeight: 500 }}>Status:</span>{' '}
        <span style={{ color: '#525252' }}>{status}</span>
      </div>
      
      <div style={{ marginBottom: '28px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 500
        }}>
          <span>Progress</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div style={{ 
          width: '100%', 
          height: '12px', 
          background: '#e5e7eb', 
          borderRadius: '6px', 
          overflow: 'hidden' 
        }}>
          <div style={{ 
            width: `${progress}%`, 
            height: '100%', 
            background: '#059669', 
            transition: 'width 0.3s ease',
            borderRadius: '6px'
          }} />
        </div>
      </div>

      {features.length > 0 && (
        <div>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: 600, 
            marginBottom: '16px',
            color: '#111'
          }}>
            Extracted Features
          </h2>
          
          <p style={{ color: '#525252', marginBottom: '16px', fontSize: '15px' }}>
            Copy this JSON and replace the contents of{' '}
            <code style={{ 
              background: '#f3f4f6', 
              padding: '2px 6px', 
              borderRadius: '4px',
              fontSize: '13px'
            }}>public/audio-features.json</code>
          </p>
          
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(features, null, 2));
                alert('Copied to clipboard!');
              }}
              style={{
                padding: '12px 20px',
                fontSize: '15px',
                fontWeight: 500,
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Copy to Clipboard
            </button>
          </div>
          
          <div style={{ 
            background: '#f0fdf4', 
            border: '1px solid #22c55e',
            padding: '16px', 
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px'
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: 500 }}>
              Verification — First entry avgMfcc[1:5]:
            </p>
            <code style={{ 
              display: 'block',
              background: '#dcfce7', 
              padding: '8px 12px', 
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
            }}>
              {features[0] && `[${features[0].avgMfcc.slice(1, 5).map(v => v.toFixed(2)).join(', ')}]`}
            </code>
            <p style={{ margin: '8px 0 0 0', color: '#166534', fontSize: '13px' }}>
              ✓ If indices 3 and 4 are positive, extraction matches live pipeline
            </p>
          </div>
          
          <textarea
            readOnly
            value={JSON.stringify(features, null, 2)}
            style={{ 
              width: '100%', 
              height: '400px', 
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace', 
              fontSize: '13px',
              lineHeight: 1.5,
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              padding: '16px',
              background: '#fafafa',
              resize: 'vertical'
            }}
          />
        </div>
      )}
    </div>
  );
}
