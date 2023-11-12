export interface IClientConfig {
    iceServerURL: string,
    videoCodec: string[],
    videoBitrateMbps: number,
    videoConstraint: MediaTrackConstraints,
    audioConstraint: MediaTrackConstraints
}

export interface IIdentity {
    name: string,
    room: string,
    role: string
}

// Parse Parameter
const param = new URLSearchParams(window.location.search);

export function idFromURL(): IIdentity {
    return {
        name: param.get("name")!,
        room: param.get("room")!,
        role: param.get("role")!,
    }
}

export function configFromURL(prefix: string, defaultConfig: IClientConfig): IClientConfig {
    const argIce = param.get(`${prefix}.ice`);
    const argCodec = param.get(`${prefix}.codec`);
    const argBitrate = param.get(`${prefix}.bitrate`);
    const argHeight = param.get(`${prefix}.height`);
    const argWidth = param.get(`${prefix}.width`);
    const argFace = param.get(`${prefix}.face`);

    return {
        iceServerURL: argIce ? argIce : defaultConfig.iceServerURL,
        videoCodec: argCodec ? argCodec.split(",") : defaultConfig.videoCodec,
        videoBitrateMbps: argBitrate ? parseInt(argBitrate) : defaultConfig.videoBitrateMbps,
        videoConstraint: {
            height: argHeight ? { ideal: parseInt(argHeight) } : defaultConfig.videoConstraint.height,
            width: argWidth ? { ideal: parseInt(argWidth) } : defaultConfig.videoConstraint.width,
            facingMode: argFace ? { ideal: argFace } : defaultConfig.videoConstraint.facingMode
        },
        audioConstraint: defaultConfig.audioConstraint,
    }
}
