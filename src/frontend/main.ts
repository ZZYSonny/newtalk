import { createConnectionFromStream, initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, socket, updateTrack } from "../common/webrtc";
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
    if(time>0){
        popInterval = setTimeout(() => { popupMessage.hidden = true }, time);
    }   
}

export async function createConnection(configFromServer: IClientConfig) {
    // Get override config
    const config = updateConfigOverride(
        "override", configFromServer
    )
    // Device Memo
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(dev => dev.kind === 'videoinput').sort((dev1, dev2) => {
        for (const key of ["front", "back"]) {
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

    async function streamStart(id: number, audio: boolean) {
        let stream: MediaStream;

        if (id >= 0) {
            popup(`Using ${cameras[curID].label}`, 3000);
            config.video.constraints.deviceId = devices[curID].deviceId
            if (cameras[curID].label.includes("front")) config.video.constraints.facingMode = "user";
            else if (cameras[curID].label.includes("back")) config.video.constraints.facingMode = "environment";
            else config.video.constraints.facingMode = undefined;
            stream = await navigator.mediaDevices.getUserMedia({
                video: config.video.constraints,
                audio: config.audio.constraints
            });
        } else {
            popup(`Using Screen Capture`, 3000);
            config.video.constraints.deviceId = undefined;
            config.video.constraints.facingMode = undefined;
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: config.video.constraints,
                audio: false
            })
        }
        if (stream.getVideoTracks().length == 0) throw "Missing Video";
        if (audio && stream.getVideoTracks().length == 0) throw "Missing Audio";
        return stream;
    }

    let curID = -1;
    async function cameraStart(audio: boolean) {
        for (let i = 0; i < cameras.length; i++) {
            curID = (curID + 1) % cameras.length;
            try {
                // Get Stream
                streamStop(localStream, true, audio);
                localStream = await streamStart(curID, audio);
                // Success
                return localStream;
            } catch (error) {
                alert(`Failed to use device: ${cameras[curID].label}\nError: ${error}`);
            }
        }
        alert(`No Camera Found`);
        throw `No Camera Found`
    }

    // Change Camera
    localVideo.onclick = async (ev) => {
        const stream = await cameraStart(false);
        const track = stream.getVideoTracks()[0];
        updateTrack(track);
        localStream.addTrack(track);
        localVideo.srcObject = localStream;
    };
    localVideo.oncontextmenu = async (ev) => {
        ev.preventDefault();
        // Get display stream before closing existing stream.
        // Because it is more likely to fail.
        const stream = await streamStart(-1, false);
        const track = stream.getVideoTracks()[0];
        streamStop(localStream, true, false);
        updateTrack(track);
        localStream.addTrack(track);
        localVideo.srcObject = localStream;
    }

    // Set initial localStream
    localStream = await cameraStart(true);
    remoteStream = new MediaStream();
    localVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;
    return createConnectionFromStream(
        id, config, localStream, remoteStream
    )
}

async function initPermission() {
    popup(`Requesting Media Permission...`, -1);
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });
    stream.getTracks().forEach((track) => track.stop());
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
            (r) => reportCaption.innerText = r.summary.join(" ")
        );
    } else if (id.role === "client") {
        initializeWebRTCClient(
            id,
            (cfg) => createConnection(cfg),
            (state) => popup(state, 3000),
            (connection) => { },
            (r) => reportCaption.innerText = r.summary.join(" ")
        );
    }
}

if (window.location.pathname.includes("call.html")) {
    initCall()
}