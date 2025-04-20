// Define the target sample rate directly in this file
const TARGET_SAMPLE_RATE = 24000;
// Simple linear interpolation for resampling
function linearInterpolate(before, after, atPoint) {
    return before + (after - before) * atPoint;
}
class ResamplingProcessor extends AudioWorkletProcessor {
    constructor(options) {
        var _a;
        super();
        this.inputBuffer = [];
        this.inputBufferLength = 0;
        this.sourceSampleRate = null;
        this.lastInputFrame = null; // Store the last frame for interpolation
        // Use the globally available sampleRate from the AudioWorkletGlobalScope if sourceSampleRate isn't provided
        // Though passing it via options is preferred for clarity and robustness.
        const processorSourceRate = ((_a = options === null || options === void 0 ? void 0 : options.processorOptions) === null || _a === void 0 ? void 0 : _a.sourceSampleRate) || sampleRate;
        if (processorSourceRate) {
            this.sourceSampleRate = processorSourceRate;
            console.log(`[ResamplingProcessor] Initialized with source rate: ${this.sourceSampleRate} Hz, target rate: ${TARGET_SAMPLE_RATE} Hz`);
        }
        else {
            console.error("[ResamplingProcessor] Critical: Could not determine source sample rate!");
        }
    }
    static get parameterDescriptors() {
        return []; // No custom parameters needed for this simple version
    }
    process(inputs, outputs, parameters) {
        var _a, _b;
        // Assuming mono input for simplicity, take the first channel of the first input
        const inputChannel = (_a = inputs[0]) === null || _a === void 0 ? void 0 : _a[0];
        // Get the first output channel
        const outputChannel = (_b = outputs[0]) === null || _b === void 0 ? void 0 : _b[0];
        if (!inputChannel || !outputChannel || !this.sourceSampleRate) {
            // Not enough data, processor not configured, or input/output structure unexpected
            // console.warn('[ResamplingProcessor] Process called with invalid state or data.');
            return true; // Keep processor alive
        }
        const sourceSr = this.sourceSampleRate;
        const targetSr = TARGET_SAMPLE_RATE;
        const resamplingRatio = sourceSr / targetSr;
        const inputLength = inputChannel.length;
        const outputLength = outputChannel.length; // Typically 128 for AudioWorklet
        // If we have a previous frame, prepend it for interpolation continuity
        const effectiveInput = this.lastInputFrame
            ? Float32Array.from([...this.lastInputFrame, ...inputChannel])
            : inputChannel;
        const effectiveInputLength = effectiveInput.length;
        // Store the actual last frame of the *current* input for the *next* call
        this.lastInputFrame = inputChannel.slice(-1); // Store the very last sample
        let outputIndex = 0;
        let inputIndex = 0; // This tracks position in the *next required* input sample
        while (outputIndex < outputLength && inputIndex < effectiveInputLength - 1) { // Need at least 2 samples to interpolate
            const requiredInputExactIndex = outputIndex * resamplingRatio;
            const beforeInputIndex = Math.floor(requiredInputExactIndex);
            const afterInputIndex = beforeInputIndex + 1;
            if (afterInputIndex < effectiveInputLength) {
                const beforeVal = effectiveInput[beforeInputIndex];
                const afterVal = effectiveInput[afterInputIndex];
                const interpolationPoint = requiredInputExactIndex - beforeInputIndex;
                outputChannel[outputIndex] = linearInterpolate(beforeVal, afterVal, interpolationPoint);
            }
            else {
                // Not enough input samples to interpolate for this output sample, reuse last valid input
                // This might happen at the very end if input buffer isn't perfectly aligned
                if (beforeInputIndex < effectiveInputLength) {
                    outputChannel[outputIndex] = effectiveInput[beforeInputIndex];
                }
                else {
                    // Edge case: can't even get the 'before' sample? Use 0 or last known good output?
                    outputChannel[outputIndex] = 0;
                    console.warn("[ResamplingProcessor] Ran out of input samples unexpectedly during interpolation.");
                }
                break; // Stop processing if we run out of input to interpolate between
            }
            outputIndex++;
            // We need to determine the input index required for the *next* output sample
            inputIndex = Math.floor((outputIndex) * resamplingRatio);
        }
        // Fill remaining output with silence if needed (shouldn't happen with correct logic)
        while (outputIndex < outputLength) {
            // console.warn('[ResamplingProcessor] Filling end of output buffer with silence.');
            outputChannel[outputIndex++] = 0;
        }
        // Keep the processor alive
        return true;
    }
}
registerProcessor('resampling-processor', ResamplingProcessor);
// Export TARGET_SAMPLE_RATE to be used elsewhere if needed
export { TARGET_SAMPLE_RATE };
