import { createConnectionFromStream, initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, updateTrack, updateVideoTrack } from "../common/webrtc";
import { createDefaultConfig, getMediaStream, idFromURL, updateConfigOverride } from "../common/utils";
import { IClientConfig, RecursivePartial } from "../common/interface";

const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;
const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;
const reportCaption = document.getElementById("reportCaption") as HTMLSpanElement;

const id = idFromURL();
let localStream: MediaStream;
let remoteStream: MediaStream;

export async function createConnection(configFromServer: IClientConfig) {
    // Get override config
    const config = updateConfigOverride(
        "override", configFromServer
    )
    // Device Memo
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(dev => dev.kind === 'videoinput').sort((dev1, dev2) => {
        for (const key of ["front", "back", "rear"]) {
            const flag1 = dev1.label.toLowerCase().includes(key);
            const flag2 = dev2.label.toLowerCase().includes(key);
            if (flag1 !== flag2) {
                if (flag1 && !flag2) return -1;
                if (!flag1 && flag2) return 1;
            }
        }
        return dev1.label.localeCompare(dev2.label);
    });
    console.info(`[DEV] Found camera`, cameras);
    // Set initial localStream
    let curID = 0;
    for (curID = 0; curID < cameras.length; curID++) {
        // Close previous localStream
        localStream?.getTracks().forEach((track) => {
            track.stop();
            localStream.removeTrack(track);
        })
        // Set Device ID
        console.info(`[DEV] Using camera`, cameras[curID]);
        config.video.constraints.deviceId = { ideal: devices[curID].deviceId };
        try {
            // Get Stream
            localStream = await navigator.mediaDevices.getUserMedia({
                video: config.video.constraints,
                audio: config.audio.constraints
            });
            // Check camera and audio are both available
            if (localStream.getVideoTracks().length == 0) throw "Missing Video";
            if (localStream.getAudioTracks().length == 0) throw "Missing Audio";
            // Success
            break;
        } catch (error) {
            alert(`Failed to use device: ${cameras[curID].label}\nError: ${error}`);
        }
    }
    remoteStream = new MediaStream();
    localVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;
    // Change Camera
    localVideo.onclick = async (ev) => {
        // Close previous video stream
        localStream.getVideoTracks().forEach((track) => {
            track.stop();
            localStream.removeTrack(track);
        })
        // Increment ID and Set Device ID
        curID = (curID + 1) % cameras.length;
        console.info(`[DEV] Using camera`, cameras[curID]);
        config.video.constraints.deviceId = { ideal: devices[curID].deviceId };
        try {
            // Get Stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: config.video.constraints,
                audio: false
            });
            // Update Track
            updateTrack(localStream, stream.getVideoTracks()[0]);
        } catch (error) {
            alert(`Failed to use device: ${cameras[curID].label}\nError: ${error}`);
        }
    };
    localVideo.oncontextmenu = async (ev) => {
        ev.preventDefault();
        // Get display stream before closing existing stream.
        // Because it is more likely to fail.
        config.video.constraints.deviceId = undefined;
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: config.video.constraints,
            audio: false
        })
        if (stream && stream.getVideoTracks().length > 0) {
            // Success
            curID = -1;
            console.info(`[DEV] Switching to screen`);
            localStream.getVideoTracks().forEach((track) => {
                track.stop();
                localStream.removeTrack(track);
            })
            updateTrack(localStream, stream.getVideoTracks()[0]);
        }
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