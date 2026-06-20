import { registerProfile } from "./override"

export type RecursivePartial<T> = {
    [P in keyof T]?: RecursivePartial<T[P]>;
};

export interface IClientRTCConfig {
    peer: RTCConfiguration,
    stack: "all" | "v4" | "v6"
    stats: IClientStatsConfig
    monitor: IClientRTCMonitorConfig
}

export interface IClientStatsConfig {
    delay: number,
    interval: number,
}

export interface IClientRTCMonitorConfig {
    /** Whether slow-speed monitoring and auto-renegotiation is active */
    enabled: boolean,
    /** Speed below this (Mbps) on both directions is considered "slow" */
    slowThreshold: number,
    /** Consecutive seconds of slow speed before triggering renegotiation */
    slowDuration: number,
    /** Ordered list of RTC profile names to cycle through on renegotiation */
    rtcProfileList: string[],
}

/** Runtime state for the bandwidth monitor (not config — not persisted/shared) */
export interface IMonitorState {
    /** Current profile name */
    currentProfile: string,
    /** Current index into rtcProfileList */
    currentProfileIndex: number,
    /** Consecutive slow-interval count */
    slowSpeedCount: number,
}

export interface IClientVideoConfig {
    codecs: string[],
    maxBitrate: number,
    minBitrate: number,
    buffer: number | null,
    constraints: MediaTrackConstraints,
}

export interface IClientAudioConfig {
    constraints: MediaTrackConstraints,
    bitrate: number,
    useRnnNoise: boolean,
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