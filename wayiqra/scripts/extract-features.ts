import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - wav-decoder doesn't have types
import wavDecoder from 'wav-decoder';
// @ts-ignore - Meyda types don't match Node.js usage
import Meyda from 'meyda';

interface AudioMetadataItem {
  path: string;
  Hebrew: string;
  English: string;
}

interface AudioFeatures {
  id: string;
  index: number;
  filename: string;
  Hebrew: string;
  English: string;
  duration: number;
  // NEW: Full MFCC sequence for DTW matching
  mfccSequence: number[][];  // Shape: [numFrames][13]
  // Keep average for backward compatibility and quick checks
  avgMfcc: number[];
  stdMfcc: number[];
}

// Import metadata
const audioMetadata: AudioMetadataItem[] = [
  { path: "/Users/cody/github/wayiqra/.audio/1a.wav", Hebrew: "מִ֥י הֶאֱמִ֖ין לִשְׁמֻעָתֵ֑נוּ", English: "Who has believed our report?" },
  { path: "/Users/cody/github/wayiqra/.audio/1b.wav", Hebrew: "וּזְר֥וֹעַ יְהוָ֖ה עַל־מִ֥י נִגְלָֽתָה׃", English: "The arm of the Lord is revealed to whom?" },
  { path: "/Users/cody/github/wayiqra/.audio/2a.wav", Hebrew: "וַיַּ֨עַל כַּיּוֹנֵ֜ק לְפָנָ֗יו", English: "He sprouted up like a shoot before him." },
  { path: "/Users/cody/github/wayiqra/.audio/2b.wav", Hebrew: "וְכַשֹּׁ֨רֶשׁ֙ מֵאֶ֣רֶץ צִיָּ֔ה", English: "And like a root from a parched land." },
  { path: "/Users/cody/github/wayiqra/.audio/2c.wav", Hebrew: "לֹא־תֹ֥אַר ל֖וֹ וְלֹ֣א הָדָ֑ר", English: "He had no form and no splendor." },
  { path: "/Users/cody/github/wayiqra/.audio/2d.wav", Hebrew: "וְנִרְאֵ֥הוּ וְלֹֽא־מַרְאֶ֖ה וְנֶחְמְדֵֽהוּ׃", English: "And if we looked, there was nothing pleasing to the sight." },
  { path: "/Users/cody/github/wayiqra/.audio/3a.wav", Hebrew: "נִבְזֶה֙ וַחֲדַ֣ל אִישִׁ֔ים", English: "He was despised and rejected by man." },
  { path: "/Users/cody/github/wayiqra/.audio/3b.wav", Hebrew: "אִ֥ישׁ מַכְאֹב֖וֹת וִיד֣וּעַ חֹ֑לִי", English: "A man of pains and familiar with sickness." },
  { path: "/Users/cody/github/wayiqra/.audio/3c.wav", Hebrew: "וּכְמַסְתֵּ֤ר פָּנִים֙ מִמֶּ֔נּוּ", English: "Like one from whom men hide their faces." },
  { path: "/Users/cody/github/wayiqra/.audio/3d.wav", Hebrew: "נִבְזֶ֖ה וְלֹ֥א חֲשַׁבְנֻֽהוּ׃", English: "He was despised, and we esteemed him not." },
  { path: "/Users/cody/github/wayiqra/.audio/4a.wav", Hebrew: "אָכֵ֤ן חֳלָיֵ֙נוּ֙ ה֣וּא נָשָׂ֔א", English: "Therefore, our sicknesses he carried." },
  { path: "/Users/cody/github/wayiqra/.audio/4b.wav", Hebrew: "וּמַכְאֹבֵ֖ינוּ סְבָלָ֑ם", English: "Our pains he bore." },
  { path: "/Users/cody/github/wayiqra/.audio/4c.wav", Hebrew: "וַאֲנַ֣חְנוּ חֲשַׁבְנֻ֔הוּ נָג֛וּעַ", English: "And we considered him stricken." },
  { path: "/Users/cody/github/wayiqra/.audio/4d.wav", Hebrew: "מֻכֵּ֥ה אֱלֹהִ֖ים וּמְעֻנֶּֽה׃", English: "Struck down by God and pitiful." },
  { path: "/Users/cody/github/wayiqra/.audio/5a.wav", Hebrew: "וְהוּא֙ מְחֹלָ֣ל מִפְּשָׁעֵ֔נוּ", English: "But he was pierced for our transgressions." },
  { path: "/Users/cody/github/wayiqra/.audio/5b.wav", Hebrew: "מְדֻכָּ֖א מֵעֲוֹנֹתֵ֑ינוּ", English: "Crushed for our iniquities." },
  { path: "/Users/cody/github/wayiqra/.audio/5c.wav", Hebrew: "מוּסַ֤ר שְׁלוֹמֵ֙נוּ֙ עָלָ֔יו", English: "The chastisement for our peace was upon him." },
  { path: "/Users/cody/github/wayiqra/.audio/5d.wav", Hebrew: "וּבַחֲבֻרָת֖וֹ נִרְפָּא־לָֽנוּ׃", English: "And by his wounds we are healed." },
  { path: "/Users/cody/github/wayiqra/.audio/6a.wav", Hebrew: "כֻּלָּ֙נוּ֙ כַּצֹּ֣אן תָּעִ֔ינוּ", English: "All of us like sheep go astray." },
  { path: "/Users/cody/github/wayiqra/.audio/6b.wav", Hebrew: "אִ֥ישׁ לְדַרְכּ֖וֹ פָּנִ֑ינוּ", English: "Each man turns to his own way." },
  { path: "/Users/cody/github/wayiqra/.audio/6c.wav", Hebrew: "וַֽיהוָה֙ הִפְגִּ֣יעַ בּ֔וֹ אֵ֖ת עֲוֹ֥ן כֻּלָּֽנוּ׃", English: "But the LORD has laid on him the iniquity of us all." },
  { path: "/Users/cody/github/wayiqra/.audio/7a.wav", Hebrew: "נִגַּ֨שׂ וְה֣וּא נַעֲנֶה֮", English: "He was oppressed and he was afflicted." },
  { path: "/Users/cody/github/wayiqra/.audio/7b.wav", Hebrew: "וְלֹ֣א יִפְתַּח־פִּיו֒", English: "But he did not open his mouth." },
  { path: "/Users/cody/github/wayiqra/.audio/7c.wav", Hebrew: "כַּשֶּׂה֙ לַטֶּ֣בַח יוּבָ֔ל", English: "Like a lamb led to the slaughter." },
  { path: "/Users/cody/github/wayiqra/.audio/7d.wav", Hebrew: "וּכְרָחֵ֕ל לִפְנֵ֥י גֹזְזֶ֖יהָ נֶאֱלָ֑מָה", English: "And as a sheep before its shearers is silent." },
  { path: "/Users/cody/github/wayiqra/.audio/7e.wav", Hebrew: "וְלֹ֥א יִפְתַּ֖ח פִּֽיו׃", English: "And he did not open his mouth." },
  { path: "/Users/cody/github/wayiqra/.audio/8a.wav", Hebrew: "מֵעֹ֤צֶר וּמִמִּשְׁפָּט֙ לֻקָּ֔ח", English: "By oppression and judgment he was taken away." },
  { path: "/Users/cody/github/wayiqra/.audio/8b.wav", Hebrew: "וְאֶת־דּוֹר֖וֹ מִ֣י יְשׂוֹחֵ֑חַ", English: "And who of his generation will consider it" },
  { path: "/Users/cody/github/wayiqra/.audio/8c.wav", Hebrew: " כִּ֤י נִגְזַר֙ מֵאֶ֣רֶץ חַיִּ֔ים ", English: "that he was cut off from the land of the living." },
  { path: "/Users/cody/github/wayiqra/.audio/8d.wav", Hebrew: "מִפֶּ֥שַׁע עַמִּ֖י נֶ֥גַע לָֽמוֹ׃", English: "For the transgression of my people he was stricken." },
  { path: "/Users/cody/github/wayiqra/.audio/9a.wav", Hebrew: "וַיִּתֵּ֤ן אֶת־רְשָׁעִים֙ קִבְר֔וֹ", English: "He set his grave amongst the wicked." },
  { path: "/Users/cody/github/wayiqra/.audio/9b.wav", Hebrew: "וְאֶת־עָשִׁ֖יר בְּמֹתָ֑יו", English: "And his tomb with a rich man." },
  { path: "/Users/cody/github/wayiqra/.audio/9c.wav", Hebrew: "עַל לֹא־חָמָ֣ס עָשָׂ֔ה", English: "Even though he had done no violence." },
  { path: "/Users/cody/github/wayiqra/.audio/9d.wav", Hebrew: "וְלֹ֥א מִרְמָ֖ה בְּפִֽיו׃", English: "And no deceit was found in his mouth." },
  { path: "/Users/cody/github/wayiqra/.audio/10a.wav", Hebrew: "וַיהוָ֞ה חָפֵ֤ץ דַּכְּאוֹ֙ הֶֽחֱלִ֔י", English: "But as for the LORD, he willed to crush him." },
  { path: "/Users/cody/github/wayiqra/.audio/10b.wav", Hebrew: "אִם־תָּשִׂ֤ים אָשָׁם֙ נַפְשׁ֔וֹ", English: "When his soul makes an offering for guilt." },
  { path: "/Users/cody/github/wayiqra/.audio/10c.wav", Hebrew: "יִרְאֶ֥ה זֶ֖רַע יַאֲרִ֣יךְ יָמִ֑ים", English: "He shall see his offspring and prolong his days." },
  { path: "/Users/cody/github/wayiqra/.audio/10d.wav", Hebrew: "וְחֵ֥פֶץ יְהוָ֖ה בְּיָד֥וֹ יִצְלָֽח׃", English: "And the will of the LORD shall prosper in his hand." },
  { path: "/Users/cody/github/wayiqra/.audio/11a.wav", Hebrew: "מֵעֲמַ֤ל נַפְשׁוֹ֙ יִרְאֶ֣ה יִשְׂבָּ֔ע", English: "From the labor of his soul he will see and be satisfied." },
  { path: "/Users/cody/github/wayiqra/.audio/11b.wav", Hebrew: "בְּדַעְתּ֗וֹ יַצְדִּ֥יק צַדִּ֛יק עַבְדִּ֖י לָֽרַבִּ֑ים", English: "By his knowledge shall the Righteous One, my Servant, make many righteous." },
  { path: "/Users/cody/github/wayiqra/.audio/11c.wav", Hebrew: "וַעֲוֹנֹתָ֖ם ה֥וּא יִסְבֹּֽל׃", English: "And their iniquities he will bear." },
  { path: "/Users/cody/github/wayiqra/.audio/12a.wav", Hebrew: "לָכֵ֞ן אֲחַלֶּק־ל֣וֹ בָרַבִּ֗ים", English: "Therefore, I apportion him a share among the great." },
  { path: "/Users/cody/github/wayiqra/.audio/12b.wav", Hebrew: "וְאֶת־עֲצוּמִים֮ יְחַלֵּ֣ק שָׁלָל֒", English: "And with the strong he will divide the plunder." },
  { path: "/Users/cody/github/wayiqra/.audio/12c.wav", Hebrew: "תַּ֗חַת אֲשֶׁ֨ר הֶעֱרָ֤ה לַמָּ֙וֶת֙ נַפְשׁ֔וֹ", English: "Because he emptied his soul unto death." },
  { path: "/Users/cody/github/wayiqra/.audio/12d.wav", Hebrew: "וְאֶת־פֹּשְׁעִ֖ים נִמְנָ֑ה", English: "And he was numbered with the transgressors." },
  { path: "/Users/cody/github/wayiqra/.audio/12e.wav", Hebrew: "וְהוּא֙ חֵטְא־רַבִּ֣ים נָשָׂ֔א", English: "And he bore the sin of many." },
  { path: "/Users/cody/github/wayiqra/.audio/12f.wav", Hebrew: "וְלַפֹּשְׁעִ֖ים יַפְגִּֽיעַ׃", English: "and makes intercession for the transgressors." },
];

// =========================================================================
// PARAMETERS - MUST MATCH EXACTLY WITH useAudioMatcher.ts
// =========================================================================
const BUFFER_SIZE = 2048;                  // Same as browser analyzer
const TARGET_SAMPLE_RATE = 48000;          // Standard browser AudioContext rate
const NUM_MFCC_COEFFICIENTS = 13;          // Same as browser analyzer
const ENERGY_THRESHOLD = 0.008;            // Same threshold as live inference

// Use same buffer size as hop for non-overlapping frames (matches browser behavior)
const HOP_SIZE = BUFFER_SIZE;

// =========================================================================

// Simple linear resampling
function resample(data: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return data;
  
  const ratio = fromRate / toRate;
  const newLength = Math.floor(data.length / ratio);
  const resampled = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const srcIdxFloor = Math.floor(srcIdx);
    const srcIdxCeil = Math.min(srcIdxFloor + 1, data.length - 1);
    const frac = srcIdx - srcIdxFloor;
    
    resampled[i] = data[srcIdxFloor] * (1 - frac) + data[srcIdxCeil] * frac;
  }
  
  return resampled;
}

async function extractFeatures(audioPath: string): Promise<{
  duration: number;
  mfccSequence: number[][];
  avgMfcc: number[];
  stdMfcc: number[];
  frameCount: number;
  goodFrameCount: number;
}> {
  console.log(`Processing: ${audioPath}`);
  
  const buffer = fs.readFileSync(audioPath);
  const audioData = await wavDecoder.decode(buffer);
  
  const originalSampleRate = audioData.sampleRate;
  const duration = audioData.channelData[0].length / originalSampleRate;
  
  // Resample to match browser AudioContext
  let channelData = audioData.channelData[0];
  
  if (originalSampleRate !== TARGET_SAMPLE_RATE) {
    console.log(`  Resampling from ${originalSampleRate}Hz to ${TARGET_SAMPLE_RATE}Hz`);
    channelData = resample(channelData, originalSampleRate, TARGET_SAMPLE_RATE);
  }
  
  // Configure Meyda
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = TARGET_SAMPLE_RATE;
  Meyda.numberOfMFCCCoefficients = NUM_MFCC_COEFFICIENTS;
  
  // Collect ALL frames above energy threshold (for DTW)
  const mfccSequence: number[][] = [];
  let totalFrames = 0;
  
  for (let i = 0; i + BUFFER_SIZE <= channelData.length; i += HOP_SIZE) {
    const frame = channelData.slice(i, i + BUFFER_SIZE);
    totalFrames++;
    
    const features = Meyda.extract(['mfcc', 'energy'], frame);
    
    // Only include frames above energy threshold (speech detection)
    if (features && features.mfcc && typeof features.energy === 'number') {
      if (features.energy > ENERGY_THRESHOLD) {
        // Store coefficients 1-12 (skip coeff 0 which is energy-like)
        mfccSequence.push((features.mfcc as number[]).slice(1, 13));
      }
    }
  }
  
  console.log(`  Frames: ${totalFrames} total, ${mfccSequence.length} above energy threshold`);
  
  if (mfccSequence.length < 5) {
    throw new Error(`Not enough frames above energy threshold (${mfccSequence.length})`);
  }
  
  // Compute average MFCC (for backward compatibility)
  const numCoeffs = mfccSequence[0].length;
  const avgMfcc: number[] = new Array(numCoeffs).fill(0);
  
  for (const frame of mfccSequence) {
    for (let c = 0; c < numCoeffs; c++) {
      avgMfcc[c] += frame[c];
    }
  }
  for (let c = 0; c < numCoeffs; c++) {
    avgMfcc[c] /= mfccSequence.length;
  }
  
  // Compute std MFCC
  const stdMfcc: number[] = new Array(numCoeffs).fill(0);
  for (const frame of mfccSequence) {
    for (let c = 0; c < numCoeffs; c++) {
      stdMfcc[c] += (frame[c] - avgMfcc[c]) ** 2;
    }
  }
  for (let c = 0; c < numCoeffs; c++) {
    stdMfcc[c] = Math.sqrt(stdMfcc[c] / mfccSequence.length);
  }
  
  return {
    duration,
    mfccSequence,
    avgMfcc,
    stdMfcc,
    frameCount: totalFrames,
    goodFrameCount: mfccSequence.length,
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('Feature Extraction for DTW Matching');
  console.log('='.repeat(60));
  console.log(`Buffer size: ${BUFFER_SIZE}`);
  console.log(`Sample rate: ${TARGET_SAMPLE_RATE}`);
  console.log(`MFCC coefficients: ${NUM_MFCC_COEFFICIENTS} (storing 1-12)`);
  console.log(`Energy threshold: ${ENERGY_THRESHOLD}`);
  console.log('='.repeat(60));
  
  const features: AudioFeatures[] = [];
  
  for (let i = 0; i < audioMetadata.length; i++) {
    const item = audioMetadata[i];
    const filename = item.path.split('/').pop() || '';
    const id = filename.replace('.wav', '');
    
    try {
      const extracted = await extractFeatures(item.path);
      
      features.push({
        id,
        index: i,
        filename,
        Hebrew: item.Hebrew,
        English: item.English,
        duration: extracted.duration,
        mfccSequence: extracted.mfccSequence,
        avgMfcc: extracted.avgMfcc,
        stdMfcc: extracted.stdMfcc,
      });
      
      console.log(`  Duration: ${extracted.duration.toFixed(2)}s, Frames: ${extracted.goodFrameCount}`);
    } catch (error) {
      console.error(`Error processing ${item.path}:`, error);
    }
  }
  
  // Write to features dump
  const outputPath = path.join(__dirname, '..', 'public', 'audio-features.json');
  fs.writeFileSync(outputPath, JSON.stringify(features, null, 2));
  console.log('');
  console.log('='.repeat(60));
  console.log(`Features saved to ${outputPath}`);
  console.log(`Total lines: ${features.length}`);
  
  // Summary stats
  const totalFrames = features.reduce((sum, f) => sum + f.mfccSequence.length, 0);
  const avgFrames = totalFrames / features.length;
  console.log(`Total MFCC frames: ${totalFrames}`);
  console.log(`Average frames per phrase: ${avgFrames.toFixed(1)}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
