export interface IClientICEConfig {
    servers: RTCIceServer[],
    transport: "all" | "relay",
    stack: "all" | "v4" | "v6"
}

export interface IClientVideoConfig {
    codecs: string[],
    bitrate: number,
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

export function configFromURL(prefix: string, defaultConfig: IClientConfig): IClientConfig {
    const argIceTransport = param.get(`${prefix}.transport`);
    const argIceStack = param.get(`${prefix}.stack`);
    const argCodec = param.get(`${prefix}.codecs`);
    const argBitrate = param.get(`${prefix}.bitrate`);
    const argHeight = param.get(`${prefix}.height`);
    const argWidth = param.get(`${prefix}.width`);
    const argFace = param.get(`${prefix}.face`);

    return {
        ice: {
            servers: defaultConfig.ice.servers,
            transport: argIceTransport ? argIceTransport as ("all" | "relay") : defaultConfig.ice.transport,
            stack: argIceStack ? argIceStack as ("all" | "v4" | "v6") : defaultConfig.ice.stack,
        },
        video: {
            codecs: argCodec ? argCodec.split(",") : defaultConfig.video.codecs,
            bitrate: argBitrate ? parseInt(argBitrate) : defaultConfig.video.bitrate,
            constraints: {
                height: argHeight ? { ideal: parseInt(argHeight) } : defaultConfig.video.constraints.height,
                width: argWidth ? { ideal: parseInt(argWidth) } : defaultConfig.video.constraints.width,
                facingMode: argFace ? { ideal: argFace } : defaultConfig.video.constraints.facingMode
            }
        },
        audio: {
            constraints: defaultConfig.audio.constraints
        }
    }
}
