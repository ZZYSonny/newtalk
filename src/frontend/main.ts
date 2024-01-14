import { createConnectionFromStream, initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, updateStream } from "../common/webrtc";
import { createDefaultConfig, getMediaStream, idFromURL, updateConfigOverride } from "../common/utils";
import { IClientConfig } from "../common/interface";

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
    let localStream: MediaStream = await getMediaStream(config, {});
    // Set Local Video
    localVideo.srcObject = localStream;
    localVideo.onclick = async (ev) => {
        localVideo.srcObject = null;
        const oldFaceMode = localStream.getVideoTracks()[0].getConstraints().facingMode;
        const newFaceMode = oldFaceMode == "user" ? "environment" : "user";
        localStream = await getMediaStream(config, {
            video: {
                source: "camera",
                constraints: {
                    facingMode: {ideal: newFaceMode}
                }
            }
        });
        localVideo.srcObject = localStream;
        updateStream(localStream);
    };
    localVideo.oncontextmenu = async (ev) => {
        ev.preventDefault();
        localVideo.srcObject = null;
        localStream = await getMediaStream(config, {
            video: {
                source: "screen",
                constraints: {
                    facingMode: undefined
                }
            }
        });
        localVideo.srcObject = localStream;
        updateStream(localStream);
    }
    return createConnectionFromStream(
        id, config, localStream,
        (remoteStream) => { remoteVideo.srcObject = remoteStream }
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