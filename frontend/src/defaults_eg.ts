import { IClientConfig } from "./interface";

export const defaultClientConfig: IClientConfig = {
    iceServerURL: "stun:stun.l.google.com:19302",
    videoCodec: ["AV1", "VP9"],
    videoBitrateMbps: 8,
    videoConstraint: {
        height: { ideal: 1080 },
        facingMode: { ideal: "user" },
    },
    audioConstraint: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        channelCount: 2,
        sampleRate: 44100,
    }
}