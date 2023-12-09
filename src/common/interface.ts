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
    summary: string
}

export interface IIdentity {
    name: string,
    room: string,
    role: "admin" | "client"
}

export const ProfileRTC: Record<string, Partial<IClientRTCConfig>> = {};
export const ProfileVideo: Record<string, Partial<IClientVideoConfig>> = {};
export const ProfileAudio: Record<string, Partial<IClientAudioConfig>> = {};
registerProfile();

const search = new URLSearchParams(window.location.search);

export function idFromURL(dict: URLSearchParams | Map<string, string> = search): IIdentity {
    return {
        name: dict.get("name") || dict.get("role")!,
        room: dict.get("room")!,
        role: dict.get("role")! as ("admin" | "client"),
    }
}

function getArg<T>(dict: URLSearchParams | Map<string, string>, prefix: string, name: string, f: (s: string) => T) {
    const p = dict.get(`${prefix}.${name}`);
    if (!p) return undefined;
    else return f(p);
}

function applyPartialInPlace<T extends object>(origin: T, partial: undefined | Partial<T>): T {
    if (partial) {
        for (const k in partial) {
            if (Array.isArray(partial[k])) {
                origin[k] = partial[k] as any;
            } else if (typeof origin[k] === 'object' && typeof partial[k] === 'object') {
                origin[k] = applyPartialInPlace(origin[k] as any, partial[k] as any);
            } else if (partial[k] !== undefined) {
                origin[k] = partial[k] as any;
            }
        }
    }
    return origin;
}

function updateConfigProfile(prefix: string, config: IClientConfig, dict: URLSearchParams | Map<string, string> = search) {
    getArg(dict, prefix, "profile.rtc",
        (s: string) => applyPartialInPlace(config.rtc, ProfileRTC[s])
    )
    getArg(dict, prefix, "profile.video",
        (s: string) => applyPartialInPlace(config.video, ProfileVideo[s])
    )
    getArg(dict, prefix, "profile.audio",
        (s: string) => applyPartialInPlace(config.audio, ProfileAudio[s])
    )
    return config;
}


export function updateConfigOverride(prefix: string, config: IClientConfig, dict: URLSearchParams | Map<string, string> = search) {
    updateConfigProfile(prefix, config, dict);
    applyPartialInPlace(config.rtc, {
        stack: getArg(dict, prefix, "rtc.stack",
            (s: string) => s as ("all" | "v4" | "v6")
        ),
    });
    applyPartialInPlace(config.video, {
        bitrate: getArg(dict, prefix, "video.bitrate",
            (s: string) => parseInt(s)
        ),
        source: getArg(dict, prefix, "video.source",
            (s: string) => s as ("screen" | "camera")
        ),
    });
    applyPartialInPlace(config.audio, {});
    return config;
}

export const createDefaultConfig = () => {
    const config = {
        rtc: {
            peer: {
                iceServers: [{
                    urls: "stun:stun.l.google.com:19302"
                }],
                iceTransportPolicy: "all",
                iceCandidatePoolSize: 16,
                rtcpMuxPolicy: "require"
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
    } as IClientConfig;
    applyPartialInPlace(config.rtc, ProfileRTC["default"]);
    applyPartialInPlace(config.video, ProfileVideo["default"]);
    applyPartialInPlace(config.audio, ProfileAudio["default"]);
    return config;
}
