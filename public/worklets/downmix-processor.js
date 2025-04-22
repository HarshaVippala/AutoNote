class DownmixProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    if (input.length === 1) {
      // already mono
      output[0].set(input[0]);
      return true;
    }
    // stereo: average left and right
    const left = input[0];
    const right = input[1];
    const mono = output[0];
    for (let i = 0; i < left.length; i++) {
      mono[i] = 0.5 * (left[i] + right[i]);
    }
    return true;
  }
}
registerProcessor('downmix-processor', DownmixProcessor); 