import { initializeWebRTCAdmin, initializeWebRTCClient } from "./webrtc.ts";
import { IClientConfig, IIdentity, configFromURL, idFromURL } from "./interface.ts";
import { defaultClientConfig } from "./defaults_private.ts";

const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;
const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;

const id = idFromURL();

async function createConnection(configFromServer: IClientConfig) {
    const config = configFromURL("override", configFromServer);
    console.log(`[Video][0][${id.role}] Parsed overriden config`, configFromServer, config)

    const pc = new RTCPeerConnection({
        iceServers: config.ice.servers,
        iceTransportPolicy: config.ice.transport
    });

    console.log(`[Video][1][${id.role}] Get Local Stream`)
    const localStream = await navigator.mediaDevices.getUserMedia({
        video: config.video.constraints,
        audio: config.audio.constraints
    });

    // Set Local Video
    localVideo.srcObject = localStream;

    // Send Video
    localStream.getTracks().forEach((track) => {
        console.log(`[Video][2][${id.role}] Sending RTC Track Type ${track.kind}`)
        pc.addTrack(track, localStream);
    });

    // Receive Video
    pc.ontrack = (ev) => {
        console.log(`[Video][3][${id.role}] Receiving RTC Track Type ${ev.track.kind}`)
        if (ev.track.kind == "video") {
            remoteVideo.srcObject = ev.streams[0];
        }
    }

    // Set Preferred video codec
    const videoTransceiver = pc.getTransceivers().find((s) => (s.sender.track ? s.sender.track.kind === 'video' : false))!;
    const supportVideoCodec = RTCRtpSender.getCapabilities('video')!.codecs;
    const selectedVideoCodec = config.video.codecs.map((name) => supportVideoCodec.filter((codec) => codec.mimeType.includes(name))).flat();
    videoTransceiver.setCodecPreferences(selectedVideoCodec);

    // Set Preferred bitrate
    const videoSender = videoTransceiver.sender;
    const videoParameters = videoSender.getParameters();
    videoParameters.encodings[0].maxBitrate = config.video.bitrate * 1000000;
    videoSender.setParameters(videoParameters);

    return pc;
}

async function initPermission() {
    stateCaption.textContent = "Requesting Media Permission...";
    await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });
}

async function initCall() {
    await initPermission();
    stateCaption.textContent = "Parsing...";
    if (id.role === "admin") {
        const allConfig = configFromURL("all", defaultClientConfig);
        const adminConfig = configFromURL("admin", allConfig);
        const clientConfig = configFromURL("client", allConfig);
        initializeWebRTCAdmin(
            createConnection, id, adminConfig, clientConfig,
            (state) => stateCaption.textContent = state
        );
    } else if (id.role === "client") {
        initializeWebRTCClient(
            createConnection, id,
            (state) => stateCaption.textContent = state
        );
    }
}

initCall()