import { IClientConfig, INetReport } from "../common/interface";
import { createDefaultConfig, idFromURL, profileFromURL, roleProfileFromURL, updateConfigOverride } from "../common/utils";
import { createConnectionFromStream, initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, socket } from "../common/webrtc";
const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;
const speedOutput = document.getElementById("speedOutput") as HTMLSpanElement;
const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;

const id = idFromURL();
const TOTAL_SEC = 12;
let benchmarkProfile = "NEW";

function perfLogStart(verb: string, stage: string) {
    speedOutput.innerText += `${verb} ${stage}\n`;
    console.log(`[PERF] ${verb} ${stage}`);
}

function perfLogSummary(side: string, r: INetReport) {
    const labels = `[${r.id}][${side}]    `;
    const items = r.summary;
    speedOutput.innerText += `${labels}${items}\n`;
    console.log(`[PERF]${labels}${items}`);
}

async function perfLocalReport(r: INetReport) {
    perfLogSummary(" LOCAL", r);
    socket.emit("webrtc debug", id, r)
}

async function createConnection(config: IClientConfig) {
    socket.removeListener("webrtc debug broadcast");
    socket.on("webrtc debug broadcast", (id, r) => {
        //perfLogSummary("REMOTE", r);
    })
    while (localVideo.paused) {
        localVideo.play();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Get Local Stream
    let localStream: MediaStream = (localVideo as any).captureStream();
    // Set Remote Video
    const remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
    // Set Local Video
    return createConnectionFromStream(
        id, config, localStream, remoteStream
    );
}

async function initCall() {
    stateCaption.textContent = "Connecting to Server...";
    await initializeSocket(null);
    stateCaption.textContent = "Parsing Config...";

    if (id.role === "admin") {
        //for (rtcProfileName of ["p6"]) {
        for (benchmarkProfile of profileFromURL()) {
            perfLogStart("Starting", benchmarkProfile);
            const speedConfig = updateConfigOverride(
                "all",
                createDefaultConfig(),
                new Map([
                    ["all.profile.rtc", "speed"],
                    ["all.profile.video", "speed"]
                ]),
            )
            const adminConfig = updateConfigOverride(
                "all", speedConfig,
                new Map([["all.profile.rtc", roleProfileFromURL("admin") || benchmarkProfile]])
            )
            const clientConfig = updateConfigOverride(
                "all", speedConfig,
                new Map([["all.profile.rtc", roleProfileFromURL("client") || benchmarkProfile]])
            )
            initializeWebRTCAdmin(
                id, adminConfig, clientConfig,
                (c) => createConnection(c),
                (s) => stateCaption.innerText = s,
                (c) => {
                    perfLogStart("", "");
                    perfLogStart("Connected", benchmarkProfile)
                },
                (r) => perfLocalReport(r)
            );
            await new Promise(r => window.setTimeout(r, (TOTAL_SEC + 2) * 1000));
            perfLogStart("Finished", benchmarkProfile);
        }
    } else if (id.role === "client") {
        initializeWebRTCClient(
            id,
            (c) => createConnection(c),
            (s) => stateCaption.innerText = s,
            (c) => {
                perfLogStart("", "");
                perfLogStart("Connected", benchmarkProfile)
            },
            (r) => perfLocalReport(r)
        )
    }
}

if (window.location.pathname.includes("test.html")) {
    initCall()
}