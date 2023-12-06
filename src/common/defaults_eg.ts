import { IClientAudioConfig, IClientConfig, IClientRTCConfig, IClientVideoConfig } from "./interface";

export const presetRTCConfig: Record<string, IClientRTCConfig> = {
    "default": {
        peer: {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            iceTransportPolicy: "all",
            iceCandidatePoolSize: 16,
        },
        stack: "all"
    }
}

export const presetVideoConfig: Record<string, IClientVideoConfig> = {
    "default": {
        codecs: ["AV1", "VP9"],
        bitrate: 8,
        source: "camera",
        constraints: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
            facingMode: { ideal: "user" },
        }
    }
}

export const presetAudioConfig: Record<string, IClientAudioConfig> = {
    "default": {
        constraints: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
            channelCount: 2,
            sampleRate: 44100,
        }
    }
}

export const defaultClientConfig: IClientConfig = {
    rtc: presetRTCConfig["default"],
    video: presetVideoConfig["default"],
    audio: presetAudioConfig["default"],

}

export const defaultServerURL = "http://localhost:8080"