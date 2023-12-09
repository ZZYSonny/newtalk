import { IClientConfig, ProfileRTC, createDefaultConfig, idFromURL, updateConfigOverride } from "../common/interface";
import { initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, socket } from "../common/webrtc";

const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;
const speedOutput = document.getElementById("speedOutput") as HTMLSpanElement;

const id = idFromURL();

const TOTAL_SEC = 12;

function channelPerf(
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

async function createConnection(config: IClientConfig) {
    socket.on("webrtc debug broadcast", (id, r) => {
        speedOutput.innerText += `${r.id} CLIEN ${r.summary} \n`
    })

    const pc = new RTCPeerConnection(config.rtc.peer);
    if (id.role === "admin") {
        const ch = pc.createDataChannel("test", {
            ordered: true,
            maxPacketLifeTime: 2000
        });
        ch.onopen = (ev) => {
            channelPerf(pc, ch, config.video.bitrate);
        };
    } else {
        pc.ondatachannel = (ev) => {
            channelPerf(pc, ev.channel, config.video.bitrate);
        }
    }
    return pc;
}

async function initBenchAdmin() {
    //for (const rtcProfileName of ["p2pv6"]) {
    for (const rtcProfileName of Object.keys(ProfileRTC).sort()) {
        speedOutput.innerText += `Starting ${rtcProfileName}\n`;
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
            (r) => speedOutput.innerText += `${r.id} ADMIN  ${r.summary} \n`
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
            (c) => createConnection(c),
            (s) => stateCaption.innerText = s,
            (c) => {},
            (r) => socket.emit("webrtc debug", id, r)
        )
    }
}

initCall()