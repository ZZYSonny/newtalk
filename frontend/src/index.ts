import { IIdentity, initializeWebRTCAdmin, initializeWebRTCClient } from "./webrtc.ts";

export interface IClientConfig {
    iceServerURL: string,
    videoCodec: string[],
    videoBitrateMbps: number,
    videoConstraint: MediaTrackConstraints,
    audioConstraint: MediaTrackConstraints
}

// Parse Parameter
const param = new URLSearchParams(window.location.search);
const id: IIdentity = {
    name: param.get("name")!,
    room: param.get("room")!,
    role: param.get("role")!,
}
const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;
const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;

async function createConnection(config: IClientConfig) {
    const pc = new RTCPeerConnection({
        iceServers: [{ "urls": config.iceServerURL }],
        iceTransportPolicy: config.iceServerURL.startsWith("turn") ? "relay" : "all"
    });

    console.log(`[Video][0][${id.role}] Get Local Stream`)
    const localStream = await navigator.mediaDevices.getUserMedia({
        video: config.videoConstraint,
        audio: config.audioConstraint
    });

    // Set Local Video
    localVideo.srcObject = localStream;

    // Send Video
    localStream.getTracks().forEach((track) => {
        console.log(`[Video][1][${id.role}] Sending RTC Track Type ${track.kind}`)
        pc.addTrack(track, localStream);
    });

    // Receive Video
    pc.ontrack = (ev) => {
        console.log(`[Video][2][${id.role}] Receiving RTC Track Type ${ev.track.kind}`)
        if (ev.track.kind == "video") {
            remoteVideo.srcObject = ev.streams[0];
        }
    }

    // Set Preferred video codec
    const videoTransceiver = pc.getTransceivers().find((s) => (s.sender.track ? s.sender.track.kind === 'video' : false))!;
    const supportVideoCodec = RTCRtpSender.getCapabilities('video')!.codecs;
    const selectedVideoCodec = config.videoCodec.map((name) => supportVideoCodec.filter((codec) => codec.mimeType.includes(name))).flat();
    videoTransceiver.setCodecPreferences(selectedVideoCodec);

    // Set Preferred bitrate
    const videoSender = videoTransceiver.sender;
    const videoParameters = videoSender.getParameters();
    videoParameters.encodings[0].maxBitrate = config.videoBitrateMbps * 1000000;
    videoSender.setParameters(videoParameters);

    return pc;
}

async function initCall() {
    if (id.role === "admin") {
        const adminConfig: IClientConfig = {
            iceServerURL: "stun:stun.l.google.com:19302",
            videoCodec: ["AV1", "VP9"],
            videoBitrateMbps: 8,
            videoConstraint: {
                height: { ideal: 1080 },
                facingMode: { ideal: "user" },
            },
            audioConstraint: {
                noiseSuppression: true,
                echoCancellation: true,
                //autoGainControl: true,
                channelCount: 2,
                sampleRate: 44100,
            }
        }
        const clientConfig: IClientConfig = {
            iceServerURL: "stun:stun.l.google.com:19302",
            videoCodec: ["AV1", "VP9"],
            videoBitrateMbps: 8,
            videoConstraint: {
                height: { ideal: 1080 },
                facingMode: { ideal: "user" }
            },
            audioConstraint: {
                noiseSuppression: true,
                echoCancellation: true,
                //autoGainControl: true,
                channelCount: 2,
                sampleRate: 44100,
            }
        }
        initializeWebRTCAdmin(
            (state) => stateCaption.innerText = state,
            createConnection, id, adminConfig, clientConfig);
    } else if (id.role === "client") {
        initializeWebRTCClient((state) => stateCaption.innerText = state, createConnection, id);
    }
}

initCall()















let localStream: MediaStream | null = null;


