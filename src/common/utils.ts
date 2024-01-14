import { IClientConfig, IClientVideoConfig, IIdentity, ProfileAudio, ProfileRTC, ProfileVideo, RecursivePartial } from "./interface";

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

function applyPartialInPlace<T extends object>(origin: T, partial: undefined | Partial<T> | RecursivePartial<T>): T {
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
            resolution: [
                [1280, 720, 30],
                [1080, 720, 30]
            ],
            constraints: {}
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

export const getMediaStream = async (config: IClientConfig, overrideConfig: RecursivePartial<IClientConfig>) => {
    const videoSource = overrideConfig?.video?.source || config.video.source || "camera";
    const getMediaDevice = (cfg: MediaStreamConstraints | DisplayMediaStreamOptions) => {
        console.info(`[Media] Attempting ${videoSource}`, cfg)
        if (videoSource === "camera") {
            return navigator.mediaDevices.getUserMedia(cfg);
        } else {
            return navigator.mediaDevices.getDisplayMedia(cfg)
        }
    }
    // First try all resolutions
    for (const resolution of config.video.resolution) {
        const videoConstraint: MediaTrackConstraints = {
            width: { ideal: resolution[0] },
            height: { ideal: resolution[1] },
            frameRate: { ideal: resolution[2] },
        }
        if (videoSource === "camera") {
            videoConstraint.facingMode = { ideal: "user" };
        }
        applyPartialInPlace(videoConstraint, config.video.constraints);
        applyPartialInPlace(videoConstraint, overrideConfig?.video?.constraints);
        try {
            return await getMediaDevice({
                video: videoConstraint, 
                audio: config.audio.constraints
            });
        } catch {
            console.error(`[Media] Failed to get user media with resolution ${resolution}`)
        }
    }
    try {
        if (Object.keys(overrideConfig).length > 0) {
            return await getMediaStream(config, {});
        } else {
            return await getMediaDevice({
                video: true,
                audio: true
            });
        }
    } catch {
        alert(`[Media] No ${videoSource} detected`);
        throw `[Media] No ${videoSource} detected`;
    }
}