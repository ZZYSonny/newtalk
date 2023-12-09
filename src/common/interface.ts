import { registerProfile } from "./override"

export interface IClientRTCConfig {
    peer: RTCConfiguration,
    stack: "all" | "v4" | "v6"
}

export interface IClientVideoConfig {
    codecs: string[],
    bitrate: number,
    source: "camera" | "screen",
    constraints: MediaTrackConstraints,
}

export interface IClientAudioConfig {
    constraints: MediaTrackConstraints
}

export interface IClientConfig {
    rtc: IClientRTCConfig,
    video: IClientVideoConfig,
    audio: IClientAudioConfig,
}

export interface INetReport {
    id: number,
    inMbps: number | undefined,
    outMbps: number | undefined,
    outMaxMbps: number | undefined,
    outLoss: number | undefined,
    summary: string[]
}

export interface IIdentity {
    name: string,
    room: string,
    role: "admin" | "client"
}

export const ProfileRTC: Record<string, Partial<IClientRTCConfig>> = {};
export const ProfileVideo: Record<string, Partial<IClientVideoConfig>> = {};
export const ProfileAudio: Record<string, Partial<IClientAudioConfig>> = {};
registerProfile(ProfileRTC, ProfileVideo, ProfileAudio);