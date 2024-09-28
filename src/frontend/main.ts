import { createConnectionFromStream, initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, socket, replaceRTCTrack } from "../common/webrtc";
import { createDefaultConfig, getMediaStream, idFromURL, updateConfigOverride } from "../common/utils";
import { IClientConfig, RecursivePartial } from "../common/interface";

const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;
const popupMessage = document.getElementById("popupMessage") as HTMLSpanElement;
const reportCaption = document.getElementById("reportCaption") as HTMLSpanElement;

const id = idFromURL();
let localStream: MediaStream;
let remoteStream: MediaStream;

let popInterval: number;
function popup(message: string, time: number) {
    if (popInterval) clearInterval(popInterval);
    popupMessage.hidden = false;
    popupMessage.innerText = message;
    if (time > 0) {
        popInterval = setTimeout(() => { popupMessage.hidden = true }, time) as any;
    }
}

export async function createConnection(configFromServer: IClientConfig) {
    // Get override config
    const config = updateConfigOverride(
        "override", configFromServer
    )
    function streamStop(stream: MediaStream | undefined, video: boolean, audio: boolean) {
        if (stream) {
            if (video) {
                stream.getVideoTracks().forEach(track => {
                    track.stop();
                    stream.removeTrack(track);
                })
            }
            if (audio) {
                stream.getAudioTracks().forEach(track => {
                    track.stop();
                    stream.removeTrack(track);
                })
            }
        }
    }

    const facingString = ["user", "environment"];
    let facingID = 0;

    async function cameraStart(audio: boolean) {
        streamStop(localStream, true, audio);
        config.video.constraints.facingMode = facingString[facingID];
        popup(`Using camera facing ${facingString[facingID]}`, 3000);
        if (facingID == 0) {
            localVideo.style.transform = "scaleX(-1)";
        } else if (facingID == 1) {
            localVideo.style.transform = "scaleX(1)";
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: config.video.constraints,
            audio: config.audio.constraints
        });
        return stream;
    }

    async function screenStart(audio: boolean) {
        config.video.constraints.facingMode = undefined;
        config.video.constraints.deviceId = undefined;
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: config.video.constraints,
            audio: false
        })
        if (stream.getVideoTracks().length === 0) throw "Missing Video";
        popup(`Using screen capture`, 3000);
        streamStop(localStream, true, audio);
        return stream;
    }

    async function updateVideoTrack(stream: MediaStream) {
        const track = stream.getVideoTracks()[0];
        replaceRTCTrack(track);
        localStream.addTrack(track);
        localVideo.srcObject = localStream;
    }

    // Set initial localStream
    localStream = await cameraStart(true);
    remoteStream = new MediaStream();
    localVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    // Change Camera
    localVideo.onclick = async (ev) => {
        // Switch Device
        facingID = (facingID + 1) % 2;
        updateVideoTrack(await cameraStart(false));
    };
    if ("getDisplayMedia" in navigator.mediaDevices) {
        localVideo.oncontextmenu = async (ev) => {
            ev.preventDefault();
            updateVideoTrack(await screenStart(false));
        }
    }

    return createConnectionFromStream(
        id, config, localStream, remoteStream
    )
}

async function initPermission() {
    const stateCamera = await navigator.permissions.query({ name: "camera" });
    const stateMicrophone = await navigator.permissions.query({ name: "microphone" });
    if (stateCamera.state !== "granted" || stateMicrophone.state !== "granted") {
        popup(`Requesting Media Permission...`, -1);
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        stream.getTracks().forEach((track) => track.stop());
    }
}

async function initCall() {
    await initPermission();
    popup(`Connecting to Server...`, -1);
    await initializeSocket(null);
    popup(`Parsing Config...`, -1);
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
            (state) => popup(state, 3000),
            (connection) => { },
            (r) => reportCaption.innerText = r.summary
        );
    } else if (id.role === "client") {
        initializeWebRTCClient(
            id,
            (cfg) => createConnection(cfg),
            (state) => popup(state, 3000),
            (connection) => { },
            (r) => reportCaption.innerText = r.summary
        );
    }
}

if (window.location.pathname.includes("call.html")) {
    initCall()
}