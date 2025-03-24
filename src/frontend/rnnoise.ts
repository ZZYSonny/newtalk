// Copied from https://github.com/jitsi/jitsi-meet/blob/master/react/features/stream-effects/noise-suppression/NoiseSuppressorWorklet.ts
import { createRNNWasmModuleSync } from '@jitsi/rnnoise-wasm';

// import { leastCommonMultiple } from '../../base/util/math';
export function greatestCommonDivisor(num1: number, num2: number) {
    let number1: number = num1;
    let number2: number = num2;

    while (number1 !== number2) {
        if (number1 > number2) {
            number1 = number1 - number2;
        } else {
            number2 = number2 - number1;
        }
    }

    return number2;
}

export function leastCommonMultiple(num1: number, num2: number) {
    const number1: number = num1;
    const number2: number = num2;

    const gcd: number = greatestCommonDivisor(number1, number2);

    return (number1 * number2) / gcd;
}

// import RnnoiseProcessor from '../rnnoise/RnnoiseProcessor';
/* eslint-disable no-bitwise */
interface IRnnoiseModule extends EmscriptenModule {
    _rnnoise_create: () => number;
    _rnnoise_destroy: (context: number) => void;
    _rnnoise_process_frame: (context: number, input: number, output: number) => number;
}

/**
 * Constant. Rnnoise default sample size, samples of different size won't work.
 */
export const RNNOISE_SAMPLE_LENGTH = 480;

/**
 *  Constant. Rnnoise only takes inputs of 480 PCM float32 samples thus 480*4.
 */
const RNNOISE_BUFFER_SIZE: number = RNNOISE_SAMPLE_LENGTH * 4;

/**
 *  Constant. Rnnoise only takes operates on 44.1Khz float 32 little endian PCM.
 */
const PCM_FREQUENCY = 44100;

/**
 * Used to shift a 32 bit number by 16 bits.
 */
const SHIFT_16_BIT_NR = 32768;

/**
 * Represents an adaptor for the rnnoise library compiled to webassembly. The class takes care of webassembly
 * memory management and exposes rnnoise functionality such as PCM audio denoising and VAD (voice activity
 * detection) scores.
 */
export default class RnnoiseProcessor {
    /**
     * Rnnoise context object needed to perform the audio processing.
     */
    private _context: number;

    /**
     * State flag, check if the instance was destroyed.
     */
    private _destroyed = false;

    /**
     * WASM interface through which calls to rnnoise are made.
     */
    private _wasmInterface: IRnnoiseModule;

    /**
     * WASM dynamic memory buffer used as input for rnnoise processing method.
     */
    private _wasmPcmInput: number;

    /**
     * The Float32Array index representing the start point in the wasm heap of the _wasmPcmInput buffer.
     */
    private _wasmPcmInputF32Index: number;

    /**
     * Constructor.
     *
     * @class
     * @param {Object} wasmInterface - WebAssembly module interface that exposes rnnoise functionality.
     */
    constructor(wasmInterface: IRnnoiseModule) {
        // Considering that we deal with dynamic allocated memory employ exception safety strong guarantee
        // i.e. in case of exception there are no side effects.
        try {
            this._wasmInterface = wasmInterface;

            // For VAD score purposes only allocate the buffers once and reuse them
            this._wasmPcmInput = this._wasmInterface._malloc(RNNOISE_BUFFER_SIZE);

            this._wasmPcmInputF32Index = this._wasmPcmInput >> 2;

            if (!this._wasmPcmInput) {
                throw Error('Failed to create wasm input memory buffer!');
            }

            this._context = this._wasmInterface._rnnoise_create();
        } catch (error) {
            // release can be called even if not all the components were initialized.
            this.destroy();
            throw error;
        }
    }

    /**
     * Release resources associated with the wasm context. If something goes downhill here
     * i.e. Exception is thrown, there is nothing much we can do.
     *
     * @returns {void}
     */
    _releaseWasmResources(): void {
        // For VAD score purposes only allocate the buffers once and reuse them
        if (this._wasmPcmInput) {
            this._wasmInterface._free(this._wasmPcmInput);
        }

        if (this._context) {
            this._wasmInterface._rnnoise_destroy(this._context);
        }
    }

    /**
     * Rnnoise can only operate on a certain PCM array size.
     *
     * @returns {number} - The PCM sample array size as required by rnnoise.
     */
    getSampleLength(): number {
        return RNNOISE_SAMPLE_LENGTH;
    }

    /**
     * Rnnoise can only operate on a certain format of PCM sample namely float 32 44.1Kz.
     *
     * @returns {number} - PCM sample frequency as required by rnnoise.
     */
    getRequiredPCMFrequency(): number {
        return PCM_FREQUENCY;
    }

    /**
     * Release any resources required by the rnnoise context this needs to be called
     * before destroying any context that uses the processor.
     *
     * @returns {void}
     */
    destroy(): void {
        // Attempting to release a non initialized processor, do nothing.
        if (this._destroyed) {
            return;
        }

        this._releaseWasmResources();

        this._destroyed = true;
    }

    /**
     * Calculate the Voice Activity Detection for a raw Float32 PCM sample Array.
     * The size of the array must be of exactly 480 samples, this constraint comes from the rnnoise library.
     *
     * @param {Float32Array} pcmFrame - Array containing 32 bit PCM samples.
     * @returns {Float} Contains VAD score in the interval 0 - 1 i.e. 0.90.
     */
    calculateAudioFrameVAD(pcmFrame: Float32Array): number {
        return this.processAudioFrame(pcmFrame);
    }

    /**
     * Process an audio frame, optionally denoising the input pcmFrame and returning the Voice Activity Detection score
     * for a raw Float32 PCM sample Array.
     * The size of the array must be of exactly 480 samples, this constraint comes from the rnnoise library.
     *
     * @param {Float32Array} pcmFrame - Array containing 32 bit PCM samples. Parameter is also used as output
     * when {@code shouldDenoise} is true.
     * @param {boolean} shouldDenoise - Should the denoised frame be returned in pcmFrame.
     * @returns {Float} Contains VAD score in the interval 0 - 1 i.e. 0.90 .
     */
    processAudioFrame(pcmFrame: Float32Array, shouldDenoise: Boolean = false): number {
        // Convert 32 bit Float PCM samples to 16 bit Float PCM samples as that's what rnnoise accepts as input
        for (let i = 0; i < RNNOISE_SAMPLE_LENGTH; i++) {
            this._wasmInterface.HEAPF32[this._wasmPcmInputF32Index + i] = pcmFrame[i] * SHIFT_16_BIT_NR;
        }

        // Use the same buffer for input/output, rnnoise supports this behavior
        const vadScore = this._wasmInterface._rnnoise_process_frame(
            this._context,
            this._wasmPcmInput,
            this._wasmPcmInput
        );

        // Rnnoise denoises the frame by default but we can avoid unnecessary operations if the calling
        // client doesn't use the denoised frame.
        if (shouldDenoise) {
            // Convert back to 32 bit PCM
            for (let i = 0; i < RNNOISE_SAMPLE_LENGTH; i++) {
                pcmFrame[i] = this._wasmInterface.HEAPF32[this._wasmPcmInputF32Index + i] / SHIFT_16_BIT_NR;
            }
        }

        return vadScore;
    }
}

/**
 * Audio worklet which will denoise targeted audio stream using rnnoise.
 */
class NoiseSuppressorWorklet extends AudioWorkletProcessor {
    /**
     * RnnoiseProcessor instance.
     */
    private _denoiseProcessor: RnnoiseProcessor;

    /**
     * Audio worklets work with a predefined sample rate of 128.
     */
    private _procNodeSampleRate = 128;

    /**
     * PCM Sample size expected by the denoise processor.
     */
    private _denoiseSampleSize: number;

    /**
     * Circular buffer data used for efficient memory operations.
     */
    private _circularBufferLength: number;

    private _circularBuffer: Float32Array;

    /**
     * The circular buffer uses a couple of indexes to track data segments. Input data from the stream is
     * copied to the circular buffer as it comes in, one `procNodeSampleRate` sized sample at a time.
     * _inputBufferLength denotes the current length of all gathered raw audio segments.
     */
    private _inputBufferLength = 0;

    /**
     * Denoising is done directly on the circular buffer using subArray views, but because
     * `procNodeSampleRate` and `_denoiseSampleSize` have different sizes, denoised samples lag behind
     * the current gathered raw audio samples so we need a different index, `_denoisedBufferLength`.
     */
    private _denoisedBufferLength = 0;

    /**
     * Once enough data has been denoised (size of procNodeSampleRate) it's sent to the
     * output buffer, `_denoisedBufferIndx` indicates the start index on the circular buffer
     * of denoised data not yet sent.
     */
    private _denoisedBufferIndx = 0;

    /**
     * C'tor.
     */
    constructor() {
        super();

        /**
         * The wasm module needs to be compiled to load synchronously as the audio worklet `addModule()`
         * initialization process does not wait for the resolution of promises in the AudioWorkletGlobalScope.
         */
        this._denoiseProcessor = new RnnoiseProcessor(createRNNWasmModuleSync());

        /**
         * PCM Sample size expected by the denoise processor.
         */
        this._denoiseSampleSize = this._denoiseProcessor.getSampleLength();

        /**
         * In order to avoid unnecessary memory related operations a circular buffer was used.
         * Because the audio worklet input array does not match the sample size required by rnnoise two cases can occur
         * 1. There is not enough data in which case we buffer it.
         * 2. There is enough data but some residue remains after the call to `processAudioFrame`, so its buffered
         * for the next call.
         * A problem arises when the circular buffer reaches the end and a rollover is required, namely
         * the residue could potentially be split between the end of buffer and the beginning and would
         * require some complicated logic to handle. Using the lcm as the size of the buffer will
         * guarantee that by the time the buffer reaches the end the residue will be a multiple of the
         * `procNodeSampleRate` and the residue won't be split.
         */
        this._circularBufferLength = leastCommonMultiple(this._procNodeSampleRate, this._denoiseSampleSize);
        this._circularBuffer = new Float32Array(this._circularBufferLength);
    }

    /**
     * Worklet interface process method. The inputs parameter contains PCM audio that is then sent to rnnoise.
     * Rnnoise only accepts PCM samples of 480 bytes whereas `process` handles 128 sized samples, we take this into
     * account using a circular buffer.
     *
     * @param {Float32Array[]} inputs - Array of inputs connected to the node, each of them with their associated
     * array of channels. Each channel is an array of 128 pcm samples.
     * @param {Float32Array[]} outputs - Array of outputs similar to the inputs parameter structure, expected to be
     * filled during the execution of `process`. By default each channel is zero filled.
     * @returns {boolean} - Boolean value that returns whether or not the processor should remain active. Returning
     * false will terminate it.
     */
    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
        // We expect the incoming track to be mono, if a stereo track is passed only on of its channels will get
        // denoised and sent pack.
        // TODO Technically we can denoise both channel however this might require a new rnnoise context, some more
        // investigation is required.
        const inData = inputs[0][0];
        const outData = outputs[0][0];

        // Exit out early if there is no input data (input node not connected/disconnected)
        // as rest of worklet will crash otherwise
        if (!inData) {
            return true;
        }

        // Append new raw PCM sample.
        this._circularBuffer.set(inData, this._inputBufferLength);
        this._inputBufferLength += inData.length;

        // New raw samples were just added, start denoising frames, _denoisedBufferLength gives us
        // the position at which the previous denoise iteration ended, basically it takes into account
        // residue data.
        for (; this._denoisedBufferLength + this._denoiseSampleSize <= this._inputBufferLength;
            this._denoisedBufferLength += this._denoiseSampleSize) {
            // Create view of circular buffer so it can be modified in place, removing the need for
            // extra copies.

            const denoiseFrame = this._circularBuffer.subarray(
                this._denoisedBufferLength,
                this._denoisedBufferLength + this._denoiseSampleSize
            );

            this._denoiseProcessor.processAudioFrame(denoiseFrame, true);
        }

        // Determine how much denoised audio is available, if the start index of denoised samples is smaller
        // then _denoisedBufferLength that means a rollover occurred.
        let unsentDenoisedDataLength;

        if (this._denoisedBufferIndx > this._denoisedBufferLength) {
            unsentDenoisedDataLength = this._circularBufferLength - this._denoisedBufferIndx;
        } else {
            unsentDenoisedDataLength = this._denoisedBufferLength - this._denoisedBufferIndx;
        }

        // Only copy denoised data to output when there's enough of it to fit the exact buffer length.
        // e.g. if the buffer size is 1024 samples but we only denoised 960 (this happens on the first iteration)
        // nothing happens, then on the next iteration 1920 samples will be denoised so we send 1024 which leaves
        // 896 for the next iteration and so on.
        if (unsentDenoisedDataLength >= outData.length) {
            const denoisedFrame = this._circularBuffer.subarray(
                this._denoisedBufferIndx,
                this._denoisedBufferIndx + outData.length
            );

            outData.set(denoisedFrame, 0);
            this._denoisedBufferIndx += outData.length;
        }

        // When the end of the circular buffer has been reached, start from the beginning. By the time the index
        // starts over, the data from the begging is stale (has already been processed) and can be safely
        // overwritten.
        if (this._denoisedBufferIndx === this._circularBufferLength) {
            this._denoisedBufferIndx = 0;
        }

        // Because the circular buffer's length is the lcm of both input size and the processor's sample size,
        // by the time we reach the end with the input index the denoise length index will be there as well.
        if (this._inputBufferLength === this._circularBufferLength) {
            this._inputBufferLength = 0;
            this._denoisedBufferLength = 0;
        }

        return true;
    }
}

registerProcessor('NoiseSuppressorWorklet', NoiseSuppressorWorklet);