import { initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient } from "../common/webrtc";
import { IClientConfig, IIdentity, configFromURL, idFromURL } from "../common/interface";
import { defaultClientConfig } from "./defaults_private";

const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;
const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;
const reportCaption = document.getElementById("reportCaption") as HTMLSpanElement;
const id = idFromURL();

async function createConnection(configFromServer: IClientConfig) {
    const config = configFromURL("override", configFromServer);
    console.log(`[Video][0][${id.role}] Parsed overriden config`, configFromServer, config)

    const pc = new RTCPeerConnection(config.rtc.peer);

    console.log(`[Video][1][${id.role}] Get Local Stream`)
    let localStream: MediaStream;

    if (config.video.source == "screen") {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: config.video.constraints,
            audio: config.audio.constraints
        });
    } else if(config.video.source == "camera") {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: config.video.constraints,
            audio: config.audio.constraints
        });
    } else {
        throw "Unknown video source"
    }
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
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });
    stream.getTracks().forEach((track) => track.stop());
}

let reportTimer: number | null = null;
async function initReport(connection: RTCPeerConnection, ms: number = 2000){
    let lastRecv = 0;
    let lastSent = 0;
    await new Promise(r => window.setTimeout(r, 5000));
    if(reportTimer) window.clearInterval(reportTimer); 
    reportTimer = window.setInterval(async() =>{
        const report = await connection.getStats();
        let curRecv = 0;
        let curSent = 0;
        let curLoss = 0;
        for(const dict of report.values()){
            if(dict.type === "inbound-rtp" && dict.kind === "video"){
                curRecv = dict.bytesReceived;
            }
            if(dict.type === "outbound-rtp" && dict.kind === "video"){
                curSent = dict.bytesSent;
            }
            if(dict.type === "remote-inbound-rtp" && dict.kind === "video"){
                curLoss = dict.fractionLost;
            }
        }
        const mbpsRecv = ((curRecv - lastRecv) / 1024 / 1024 * 8) / (ms / 1000);
        const mbpsSent = ((curSent - lastSent) / 1024 / 1024 * 8) / (ms / 1000);
        const percLoss = curLoss * 100;
        lastRecv = curRecv;
        lastSent = curSent;
        reportCaption.innerText = `${mbpsRecv.toPrecision(2)}↓ ${mbpsSent.toPrecision(2)}↑ ${percLoss.toPrecision(2)}%`;
    }, ms)
}

async function initCall() {
    await initPermission();
    stateCaption.textContent = "Connecting to Server...";
    await initializeSocket(null);
    stateCaption.textContent = "Parsing Config...";
    if (id.role === "admin") {
        const allConfig = configFromURL("all", defaultClientConfig);
        const adminConfig = configFromURL("admin", allConfig);
        const clientConfig = configFromURL("client", allConfig);
        const connection = await initializeWebRTCAdmin(
            createConnection, id, adminConfig, clientConfig,
            (state) => stateCaption.textContent = state,
            (connection) => initReport(connection)
        );
    } else if (id.role === "client") {
        const connection = await initializeWebRTCClient(
            createConnection, id,
            (state) => stateCaption.textContent = state,
            (connection) => initReport(connection)
        );
    }
}

initCall()