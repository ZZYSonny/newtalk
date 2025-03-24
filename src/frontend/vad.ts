
class MyAudioProcessor extends AudioWorkletProcessor {
    historyVolume: number = 0.0;
    historySpeaking: boolean = false;


    constructor() {
        super();
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
        const volumeGrow: number = 0.2;
        const volumeDecay: number = 0.044;

        let square = 0.0;
        let count = 0;
        for (const input of inputs)
            for (const channel of input)
                for (const sample of channel) {
                    square += sample * sample;
                    count += 1;
                }

        const curVolume = square / count;
        if (curVolume < this.historyVolume) {
            this.historyVolume = (1 - volumeDecay) * this.historyVolume + volumeDecay * curVolume;
        } else {
            this.historyVolume = (1 - volumeGrow) * this.historyVolume + volumeGrow * curVolume;
        }

        const curSpeaking = this.historyVolume > 1e-6;

        if (this.historySpeaking !== curSpeaking) {
            this.historySpeaking = curSpeaking;
            this.port.postMessage(curSpeaking)
        }


        if (curSpeaking) {
            for (let i = 0; i < Math.min(inputs.length, outputs.length); i++)
                for (let j = 0; j < Math.min(inputs[i].length, outputs[i].length); j++)
                    outputs[i][j].set(inputs[i][j]);
        }
        return true;
    }
}

registerProcessor("zzy-vad", MyAudioProcessor);
