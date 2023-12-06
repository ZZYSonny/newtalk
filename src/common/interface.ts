import { presetAudioConfig, presetRTCConfig, presetVideoConfig } from "./defaults_private";

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
    recvMbps: number,
    sendMbps: number,
    sendLoss: number
}

export interface IIdentity {
    name: string,
    room: string,
    role: "admin" | "client"
}

// Parse Parameter
const param = new URLSearchParams(window.location.search);

export function idFromURL(): IIdentity {
    return {
        name: param.get("name") || param.get("role")!,
        room: param.get("room")!,
        role: param.get("role")! as ("admin" | "client"),
    }
}

function getArg<T>(prefix: string, name: string, f: (s: string) => T, defaultValue: T) {
    const p = param.get(`${prefix}.${name}`);
    if (!p) return defaultValue;
    else return f(p);
}

function getArgWithNull<T>(prefix: string, name: string, f: (s: string) => T, defaultValue: T) {
    const p = param.get(`${prefix}.${name}`);
    if (!p) return defaultValue;
    else if (p == "null") return undefined;
    else return f(p);
}

function iceServerFilter(servers: RTCIceServer[] | undefined, stunType: "all" | "tcp" | "udp") {
    if (!servers || stunType == "all") {
        return servers;
    } else {
        return servers.filter(s => {
            if (typeof s.urls == "string") return s.urls.endsWith(stunType);
            else return true;
        })
    }
}

export function configFromURL(prefix: string, defaultConfig: IClientConfig): IClientConfig {
    function rtcFromURL(prefix: string, defaultConfig: IClientRTCConfig): IClientRTCConfig {
        return {
            peer: {
                iceTransportPolicy: getArg(prefix, "rtc.transport",
                    (s: string) => s as ("all" | "relay"),
                    defaultConfig.peer.iceTransportPolicy),
                iceServers: getArg(prefix, "rtc.stun",
                    (s: string) => iceServerFilter(
                        defaultConfig.peer.iceServers,
                        s as ("all" | "tcp" | "udp")),
                    defaultConfig.peer.iceServers),
                iceCandidatePoolSize: defaultConfig.peer.iceCandidatePoolSize,
                rtcpMuxPolicy: defaultConfig.peer.rtcpMuxPolicy,
                bundlePolicy: defaultConfig.peer.bundlePolicy,
                certificates: defaultConfig.peer.certificates
            },
            stack: getArg(prefix, "rtc.stack",
                (s: string) => s as ("all" | "v4" | "v6"),
                defaultConfig.stack),
        }
    }

    function videoFromURL(prefix: string, defaultConfig: IClientVideoConfig): IClientVideoConfig {
        return {
            codecs: getArg(prefix, "video.codecs",
                (s: string) => s.split(","),
                defaultConfig.codecs
            ),
            bitrate: getArg(prefix, "video.bitrate",
                (s: string) => parseInt(s),
                defaultConfig.bitrate
            ),
            source: getArg(prefix, "video.source",
                (s: string) => s as ("screen" | "camera"),
                defaultConfig.source),
            constraints: {
                height: getArgWithNull(prefix, "video.height",
                    (s: string) => { return { ideal: parseInt(s) } as ConstrainULong },
                    defaultConfig.constraints.height
                ),
                width: getArgWithNull(prefix, "video.width",
                    (s: string) => { return { ideal: parseInt(s) } as ConstrainULong },
                    defaultConfig.constraints.width
                ),
                frameRate: getArgWithNull(prefix, "video.fps",
                    (s: string) => { return { ideal: parseInt(s) } as ConstrainULong },
                    defaultConfig.constraints.frameRate
                ),
                facingMode: getArgWithNull(prefix, "video.face",
                    (s: string) => { return { ideal: s } as ConstrainDOMString },
                    defaultConfig.constraints.facingMode
                ),
            }
        }
    }

    function audioFromURL(prefix: string, defaultConfig: IClientAudioConfig): IClientAudioConfig {
        return {
            constraints: defaultConfig.constraints
        }
    }

    return {
        rtc: rtcFromURL(prefix, getArg(
            prefix, "rtc.profile",
            (s: string) => presetRTCConfig[s],
            defaultConfig.rtc
        )),
        video: videoFromURL(prefix, getArg(
            prefix, "video.profile",
            (s: string) => presetVideoConfig[s],
            defaultConfig.video
        )),
        audio: audioFromURL(prefix, getArg(
            prefix, "audio.profile",
            (s: string) => presetAudioConfig[s],
            defaultConfig.audio
        ))
    }
}
