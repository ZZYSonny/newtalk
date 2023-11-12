import { IClientConfig } from "./interface";

export const defaultClientConfig: IClientConfig = {
    ice: {
        urls: ["stun:stun.l.google.com:19302"],
        transport: "all",
        stack: "all"
    },
    video: {
        codecs: ["AV1", "VP9"],
        bitrate: 8,
        constraints: {
            height: { ideal: 1080 },
            facingMode: { ideal: "user" },
        }
    },
    audio: {
        constraints: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
            channelCount: 2,
            sampleRate: 44100,
        }
    }
}