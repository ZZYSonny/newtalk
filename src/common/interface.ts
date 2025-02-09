import { registerProfile } from "./override"

export type RecursivePartial<T> = {
    [P in keyof T]?: RecursivePartial<T[P]>;
};

export interface IClientRTCConfig {
    peer: RTCConfiguration,
    stack: "all" | "v4" | "v6"
    stats: IClientStatsConfig
}

export interface IClientStatsConfig {
    delay: number,
    interval: number
}

export interface IClientVideoConfig {
    codecs: string[],
    bitrate: number,
    buffer: number | null,
    constraints: MediaTrackConstraints,
}

export interface IClientAudioConfig {
    constraints: MediaTrackConstraints,
    bitrate: number
}

export interface IClientConfig {
    rtc: IClientRTCConfig,
    video: IClientVideoConfig,
    audio: IClientAudioConfig,
}

export interface INetReport {
    id: number,
    inMbps: number,
    inLoss: number,
    outMbps: number,
    outLoss: number,
    outMaxMbps: number,
    summary: string
}

export interface IIdentity {
    name: string,
    room: string,
    role: "admin" | "client"
}

export const ProfileRTC: Record<string, RecursivePartial<IClientRTCConfig>> = {};
export const ProfileVideo: Record<string, RecursivePartial<IClientVideoConfig>> = {};
export const ProfileAudio: Record<string, RecursivePartial<IClientAudioConfig>> = {};
registerProfile(ProfileRTC, ProfileVideo, ProfileAudio);