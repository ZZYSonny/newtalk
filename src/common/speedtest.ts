import { initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient } from "./webrtc";
import { IClientConfig, IIdentity } from '../common/interface';


function channelPerf(connection: RTCPeerConnection, channel: RTCDataChannel, mbps: number) {
    const candidates = connection.sctp?.transport.iceTransport.getSelectedCandidatePair();
    console.log("Channel Opened")
    if (candidates) {
        console.log("      ", candidates.local!.candidate);
        console.log(" <==> ", candidates.remote!.candidate);
    }
    console.log("time\t\tsend\tmbps\trecv\tmbps\terror\tbuffer")

    let cur = 0;
    let cntSend = 0;
    let cntReceive = 0;
    let cntError = 0;
    const bytes_per_message = (typeof process != "undefined")? 24 * 1024: 256 * 1024;
    const message_per_second = mbps * 1024 * 1024 / bytes_per_message;
    const msg = new Uint8Array(bytes_per_message);

    channel.onmessage = (ev) => {
        cntReceive += 1;
    }
    channel.onerror = (ev) => {
        cntError += 1;
    }
    const timer1 = setInterval(() => {
        channel.send(msg);
        cntSend += 1;
    }, 1000 / message_per_second)
    const timer2 = setInterval(() => {
        const sendSpeed = bytes_per_message * cntSend / 1024 / 1024;
        const recvSpeed = bytes_per_message * cntReceive / 1024 / 1024;
        console.log(`${cur.toFixed(2)}-${(cur + 1).toFixed(2)}\t${cntSend}\t${sendSpeed.toFixed(3)}\t${cntReceive}\t${recvSpeed.toFixed(3)}\t${cntError}\t${channel.bufferedAmount}`)
        cur += 1
        cntSend = 0
        cntReceive = 0
        cntError = 0
        if (cur == 10) {
            channel.close()
            connection.close()
            if(typeof process != "undefined"){
                process.exit()
            }
        }
    }, 1000)
    channel.onclose = (() => {
        clearInterval(timer1);
        clearInterval(timer2);
    })
}

export async function initialPerfAdmin(bothConfig: IClientConfig, createConnection: (config: IClientConfig) => RTCPeerConnection, update: null | ((s: string) => void)) {
    await initializeWebRTCAdmin(async (config) => {
        const pc = createConnection(config);
        const ch = pc.createDataChannel("test", {
            ordered: false,
            maxRetransmits: 0
        });
        ch.addEventListener("open", (ev) => { channelPerf(pc, ch, config.video.bitrate); })
        return pc;
    }, {
        name: "admin",
        role: "admin",
        room: "speed"
    }, bothConfig, bothConfig, update);
}

export async function initialPerfClient(createConnection: (config: IClientConfig) => RTCPeerConnection, update: null | ((s: string) => void)) {
    await initializeWebRTCClient(async (c) => {
        const pc = createConnection(c);
        pc.ondatachannel = (ev) => {channelPerf(pc, ev.channel, c.video.bitrate);}
        return pc;
    }, {
        name: "admin",
        role: "admin",
        room: "speed"
    }, update);
}