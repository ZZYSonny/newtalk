import { createConnectionFromStream, initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, updateVideoTrack } from "../common/webrtc";
import { createDefaultConfig, getMediaStream, idFromURL, updateConfigOverride } from "../common/utils";
import { IClientConfig, RecursivePartial } from "../common/interface";

const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;
const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;
const reportCaption = document.getElementById("reportCaption") as HTMLSpanElement;

const id = idFromURL();

export async function createConnection(configFromServer: IClientConfig) {
    const config = updateConfigOverride(
        "override", configFromServer
    )
    // Get Local Stream
    let videoDevice: "camera" | "screen" = "camera";
    let videoCameraFace: "user" | "environment" = "user";
    let localStream: MediaStream = await getMediaStream(config, videoDevice, "mic");
    let remoteStream = new MediaStream();
    // Set Local Video
    localVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;
    // Change camera function
    const changeCamera = async () => {
        localVideo.srcObject = null;
        localStream.getVideoTracks().forEach((track) => {
            track.stop();
            localStream.removeTrack(track);
        })
        const newStream = await getMediaStream(config, videoDevice, null);
        const newTrack = newStream.getVideoTracks()[0];
        localStream.addTrack(newTrack);
        updateVideoTrack(newTrack);
        localVideo.srcObject = localStream;
    }
    localVideo.onclick = async (ev) => {
        videoDevice = "camera";
        if (videoCameraFace == "user") videoCameraFace = "environment";
        else videoCameraFace = "user";
        config.video.constraints.facingMode = { ideal: videoCameraFace };
        await changeCamera();
    };
    localVideo.oncontextmenu = async (ev) => {
        ev.preventDefault();
        videoDevice = "screen";
        await changeCamera();
    }
    return createConnectionFromStream(
        id, config, localStream, remoteStream
    )
}

async function initPermission() {
    stateCaption.textContent = "Requesting Media Permission...";
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });
    stream.getTracks().forEach((track) => track.stop());
}

async function initCall() {
    await initPermission();
    stateCaption.textContent = "Connecting to Server...";
    await initializeSocket(null);
    stateCaption.textContent = "Parsing Config...";
    if (id.role === "admin") {
        const adminConfig = updateConfigOverride(
            "admin", updateConfigOverride(
                "all", createDefaultConfig()
            )
        );
        const clientConfig = updateConfigOverride(
            "client", updateConfigOverride(
                "all", createDefaultConfig()
            )
        );
        initializeWebRTCAdmin(
            id, adminConfig, clientConfig,
            (cfg) => createConnection(cfg),
            (state) => stateCaption.textContent = state,
            (connection) => { },
            (r) => reportCaption.innerText = r.summary.join(" ")
        );
    } else if (id.role === "client") {
        initializeWebRTCClient(
            id,
            (cfg) => createConnection(cfg),
            (state) => stateCaption.textContent = state,
            (connection) => { },
            (r) => reportCaption.innerText = r.summary.join(" ")
        );
    }
}

if (window.location.pathname.includes("call.html")) {
    initCall()
}