// Add type declarations for AudioWorkletGlobalScope
declare const sampleRate: number;
declare function registerProcessor(name: string, constructor: new (options?: AudioWorkletNodeOptions) => any): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

// Define the target sample rate directly in this file
const TARGET_SAMPLE_RATE = 24000;

// Simple linear interpolation for resampling
function linearInterpolate(before: number, after: number, atPoint: number): number {
  return before + (after - before) * atPoint;
}

// Define the typical block size for AudioWorklets
const BLOCK_SIZE = 128;

class ResamplingProcessor extends AudioWorkletProcessor {
  // Remove unused properties: inputBuffer, inputBufferLength
  private sourceSampleRate: number | null = null;
  private lastInputSample: number = 0; // Store only the single last sample needed for interpolation
  private workBuffer: Float32Array; // Pre-allocated buffer

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    // Pre-allocate work buffer: 1 for last sample + BLOCK_SIZE for current input block
    this.workBuffer = new Float32Array(1 + BLOCK_SIZE);

    const processorSourceRate = options?.processorOptions?.sourceSampleRate || sampleRate;

    if (processorSourceRate) {
      this.sourceSampleRate = processorSourceRate;
      console.log(`[ResamplingProcessor] Initialized with source rate: ${this.sourceSampleRate} Hz, target rate: ${TARGET_SAMPLE_RATE} Hz`);
    } else {
      console.error("[ResamplingProcessor] Critical: Could not determine source sample rate!");
    }
  }

  static get parameterDescriptors() {
    return []; // No custom parameters needed for this simple version
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const inputChannel = inputs[0]?.[0];
    const outputChannel = outputs[0]?.[0];

    if (!inputChannel || !outputChannel || !this.sourceSampleRate) {
      return true; // Keep processor alive if input/output/config is invalid
    }
    
    // Ensure inputChannel length matches expected BLOCK_SIZE for buffer safety
    // If not, we might need more complex buffer management, but worklets usually provide fixed blocks.
    if (inputChannel.length !== BLOCK_SIZE) {
        console.warn(`[ResamplingProcessor] Unexpected input block size: ${inputChannel.length}. Expected ${BLOCK_SIZE}.`);
        // Handle this case: maybe return true, or try to process anyway if safe?
        // For now, let's proceed cautiously, assuming the workBuffer is large enough.
        // A more robust solution would resize workBuffer if needed, but adds complexity.
    }

    const sourceSr = this.sourceSampleRate;
    const targetSr = TARGET_SAMPLE_RATE;
    const resamplingRatio = sourceSr / targetSr;
    const outputLength = outputChannel.length; // Should also be BLOCK_SIZE (128)

    // --- Use pre-allocated workBuffer ---
    // Copy the last sample from the previous block
    this.workBuffer[0] = this.lastInputSample;
    // Copy the current input block samples after the last sample
    this.workBuffer.set(inputChannel, 1);
    // Now, workBuffer contains [lastSample, currentSample0, currentSample1, ...]
    const effectiveInputLength = 1 + inputChannel.length; // Total samples available in workBuffer

    // Store the actual last sample of the *current* input block for the *next* call
    this.lastInputSample = inputChannel[inputChannel.length - 1];
    // --- End buffer usage ---

    let outputIndex = 0;

    // Process using the workBuffer (effectiveInput)
    while (outputIndex < outputLength) {
      const requiredInputExactIndex = outputIndex * resamplingRatio;
      const beforeInputIndex = Math.floor(requiredInputExactIndex);
      const afterInputIndex = beforeInputIndex + 1;

      // Check if we have enough samples in the workBuffer for interpolation
      if (afterInputIndex < effectiveInputLength) {
          const beforeVal = this.workBuffer[beforeInputIndex];
          const afterVal = this.workBuffer[afterInputIndex];
          const interpolationPoint = requiredInputExactIndex - beforeInputIndex;

          outputChannel[outputIndex] = linearInterpolate(beforeVal, afterVal, interpolationPoint);
      } else {
          // Not enough input samples in the current workBuffer to interpolate for this output sample.
          // This might happen if the resampling ratio requires looking slightly beyond the current block + last sample.
          // Use the last available sample from the workBuffer.
          if (beforeInputIndex < effectiveInputLength) {
             outputChannel[outputIndex] = this.workBuffer[beforeInputIndex];
             // Log only once if this condition is repeatedly met to avoid spam
             if (outputIndex === 0 || outputChannel[outputIndex -1] !== this.workBuffer[beforeInputIndex]) {
                 console.warn(`[ResamplingProcessor] Insufficient lookahead in workBuffer for output index ${outputIndex}. Using last available sample.`);
             }
           } else {
             // Edge case: required index is beyond even the last sample in workBuffer. Use 0.
             outputChannel[outputIndex] = 0;
             console.error(`[ResamplingProcessor] Critical interpolation error at output index ${outputIndex}. Required input index ${requiredInputExactIndex} is out of bounds (${effectiveInputLength}).`);
           }
           // Don't necessarily 'break' here, maybe the next output sample maps back into the buffer.
           // However, if this happens consistently, the resampling logic might need adjustment.
      }

      outputIndex++;
    }

    // No need for the second loop to fill with silence, as the main loop covers outputLength.

    // Keep the processor alive
    return true;
  }
}

registerProcessor('resampling-processor', ResamplingProcessor);

// Export TARGET_SAMPLE_RATE to be used elsewhere if needed
export { TARGET_SAMPLE_RATE }; 