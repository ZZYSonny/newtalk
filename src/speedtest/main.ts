import { IClientConfig, configFromURL, idFromURL } from "../common/interface";
import { initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient, resetWebRTC } from "../common/webrtc";
import { defaultClientConfig, presetAudioConfig, presetRTCConfig, presetVideoConfig } from "../common/defaults_private";

const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;
const speedOutput = document.getElementById("speedOutput") as HTMLSpanElement;

const id = idFromURL();

function channelPerf(
    connection: RTCPeerConnection,
    channel: RTCDataChannel,
    targetMbps: number,
    bytePerMsg: number = 256 * 1024,
    totalSecs: number = 10
) {
    const interval = 1000 / (targetMbps * 1024 * 1024 / bytePerMsg);
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
    }, totalSecs * 1000)
}

async function createConnection(config: IClientConfig) {
    const pc = new RTCPeerConnection(config.rtc.peer);
    if (id.role === "admin") {
        const ch = pc.createDataChannel("test", {
            ordered: false,
            maxRetransmits: 0
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
    for (const rtcProfileName in presetRTCConfig) {
        speedOutput.innerText += `Starting ${rtcProfileName}\n`;
        const allConfig: IClientConfig = {
            rtc: presetRTCConfig[rtcProfileName],
            video: presetVideoConfig["default"],
            audio: presetAudioConfig["default"]
        }
        initializeWebRTCAdmin(
            id, allConfig, allConfig,
            (c) => createConnection(c),
            (s) => stateCaption.innerText = s,
            (c) => { },
            (r) => speedOutput.innerText += `${r.recvMbps.toPrecision(2)}↓ ${r.sendMbps.toPrecision(2)}↑ ${r.sendLoss.toPrecision(2)}%\n`
        );
        await new Promise(r => window.setTimeout(r, 15*1000));
        resetWebRTC();
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
            (c) => { }
        )
    }
}

initCall()