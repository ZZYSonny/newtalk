import { IClientConfig } from "../common/interface";

export const defaultClientConfig: IClientConfig = {
    rtc: {
        peer: {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            iceTransportPolicy: "all",
            iceCandidatePoolSize: 16,
        },
        stack: "all"
    },
    video: {
        codecs: ["AV1", "VP9"],
        bitrate: 8,
        source: "camera",
        constraints: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
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

export const defaultServerURL = "http://localhost:8080"