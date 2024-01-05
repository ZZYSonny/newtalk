import { IClientConfig, IIdentity, ProfileAudio, ProfileRTC, ProfileVideo } from "./interface";

const search = new URLSearchParams(window.location.search);

export function idFromURL(dict: URLSearchParams | Map<string, string> = search): IIdentity {
    return {
        name: dict.get("name") || dict.get("role")!,
        room: dict.get("room")!,
        role: dict.get("role")! as ("admin" | "client"),
    }
}

export function profileFromURL(dict: URLSearchParams | Map<string, string> = search): string[] {
    return dict.get("all.profile.rtc")?.split("-") || Object.keys(ProfileRTC).sort();
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
            stack: "all",
            stats: {
                delay: 2,
                interval: 3
            }
        },
        video: {
            codecs: ["AV1", "VP9"],
            bitrate: 6,
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
