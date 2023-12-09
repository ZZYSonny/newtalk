import { IClientConfig, INetReport, ProfileRTC} from "../common/interface";
import {createDefaultConfig, idFromURL, updateConfigOverride} from "../common/utils";
import { initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, socket } from "../common/webrtc";

const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;
const speedOutput = document.getElementById("speedOutput") as HTMLSpanElement;

const id = idFromURL();

const TOTAL_SEC = 12;

function perfChannel(
    connection: RTCPeerConnection,
    channel: RTCDataChannel,
    targetMbps: number,
    bytePerMsg: number = 32 * 1024,
) {
    const interval = 1000 / (targetMbps / 8 * 1024 * 1024 / bytePerMsg );
    const msg = new Uint8Array(bytePerMsg);
    const timer = setInterval(() => {
        if (channel.readyState == "open") {
            channel.send(msg);
        } else {
            clearInterval(timer);
        }
    }, interval)

    setTimeout(() => {
        channel.close();
        connection.close();
    }, TOTAL_SEC * 1000)
}

function perfLogStart(stage: string){
    speedOutput.innerText += `\nStarting ${stage}\n`;
    console.log(`[PERF]`);
    console.log(`[PERF] Starting ${stage}`);
}

function perfLogSummary(side: string, r: INetReport){
    speedOutput.innerText += `${side.padEnd(8," ")} ${r.summary.map(s=>s.padEnd(8, " ")).join("")}\n`;
    console.log(`[PERF][${side}] ${r.summary.map(s=>s.padEnd(8, " ")).join("")}`);
}

async function perfLocalReport(r: INetReport){
    perfLogSummary("LOCAL", r);
    socket.emit("webrtc debug", id, r)
}

async function createConnection(config: IClientConfig) {
    socket.removeListener("webrtc debug broadcast");
    socket.on("webrtc debug broadcast", (id, r) => {
        perfLogSummary("REMOT", r);
    })

    const pc = new RTCPeerConnection(config.rtc.peer);
    if (id.role === "admin") {
        const ch = pc.createDataChannel("test", {
            ordered: true,
            maxPacketLifeTime: 2000
        });
        ch.onopen = (ev) => {
            perfChannel(pc, ch, config.video.bitrate);
        };
    } else {
        pc.ondatachannel = (ev) => {
            perfChannel(pc, ev.channel, config.video.bitrate);
        }
    }
    return pc;
}

async function initBenchAdmin() {
    //for (const rtcProfileName of ["p2pv6"]) {
    for (const rtcProfileName of Object.keys(ProfileRTC).sort()) {
        perfLogStart(rtcProfileName);
        //const allConfig
        const allConfig = updateConfigOverride(
            "all",
            createDefaultConfig(),
            new Map([["all.profile.rtc", rtcProfileName]]), 
        )
        initializeWebRTCAdmin(
            id, allConfig, allConfig,
            (c) => createConnection(c),
            (s) => stateCaption.innerText = s,
            (c) => {},
            (r) => perfLocalReport(r)
        );
        await new Promise(r => window.setTimeout(r, (TOTAL_SEC+2)*1000));
    }

}

async function initCall() {
    stateCaption.textContent = "Connecting to Server...";
    await initializeSocket(null);
    stateCaption.textContent = "Parsing Config...";

    if (id.role === "admin") {
        initBenchAdmin()
    } else if (id.role === "client") {
        initializeWebRTCClient(
            id,
            (c) => {
                perfLogStart(`New`);
                return createConnection(c)
            },
            (s) => stateCaption.innerText = s,
            (c) => {},
            (r) => perfLocalReport(r)
        )
    }
}

initCall()