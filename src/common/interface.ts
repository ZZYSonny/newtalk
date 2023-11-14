export interface IClientICEConfig {
    servers: RTCIceServer[],
    transport: "all" | "relay",
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
    ice: IClientICEConfig,
    video: IClientVideoConfig,
    audio: IClientAudioConfig,
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
        name: param.get("name")!,
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

export function configFromURL(prefix: string, defaultConfig: IClientConfig): IClientConfig {
    const argIceTransport = param.get(`${prefix}.transport`);
    const argIceStack = param.get(`${prefix}.stack`);
    const argCodec = param.get(`${prefix}.codecs`);
    const argBitrate = param.get(`${prefix}.bitrate`);
    const argHeight = param.get(`${prefix}.height`);
    const argWidth = param.get(`${prefix}.width`);
    const argFPS = param.get(`${prefix}.fps`);
    const argFace = param.get(`${prefix}.face`);
    const argSource = param.get(`${prefix}.source`);

    return {
        ice: {
            servers: defaultConfig.ice.servers,
            transport: getArg(prefix, "transport",
                (s: string) => s as ("all" | "relay"),
                defaultConfig.ice.transport),
            stack: getArg(prefix, "stack",
                (s: string) => s as ("all" | "v4" | "v6"),
                defaultConfig.ice.stack),
        },
        video: {
            codecs: getArg(prefix, "codecs",
                (s: string) => s.split(","),
                defaultConfig.video.codecs
            ),
            bitrate: getArg(prefix, "bitrate",
                (s: string) => parseInt(s),
                defaultConfig.video.bitrate
            ),
            source: getArg(prefix, "source",
                (s: string) => s as ("screen" | "camera"),
                defaultConfig.video.source),
            constraints: {
                height: getArgWithNull(prefix, "height",
                    (s: string) => { return { ideal: parseInt(s) } as ConstrainULong },
                    defaultConfig.video.constraints.height
                ),
                width: getArgWithNull(prefix, "width",
                    (s: string) => { return { ideal: parseInt(s) } as ConstrainULong },
                    defaultConfig.video.constraints.width
                ),
                frameRate: getArgWithNull(prefix, "fps",
                    (s: string) => { return { ideal: parseInt(s) } as ConstrainULong },
                    defaultConfig.video.constraints.frameRate
                ),
                facingMode: getArgWithNull(prefix, "face",
                    (s: string) => { return { ideal: s } as ConstrainDOMString },
                    defaultConfig.video.constraints.facingMode
                ),
            }
        },
        audio: {
            constraints: defaultConfig.audio.constraints
        }
    }
}
