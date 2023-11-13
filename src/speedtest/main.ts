import nodeDatachannelPolyfill from 'node-datachannel/polyfill';
import { initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient } from "../common/webrtc";
import { defaultClientConfig, defaultServerURL } from "./defaults_private"
import { IClientConfig, IIdentity } from '../common/interface';

// Disable webrtc.ts logging
console.info = (...args) =>{};


async function channelPerf(connection: nodeDatachannelPolyfill.RTCPeerConnection, channel: RTCDataChannel, mbps: number) {
    const candidates = connection.sctp?.transport.iceTransport.getSelectedCandidatePair();
    console.log("Channel Opened")
    if(candidates){
        console.log("      ", candidates.local!.candidate);
        console.log(" <==> ", candidates.remote!.candidate);
    }
    console.log("time\t\tsend\trecv\terr\tmbps")
    
    let cur = 0;
    let cntReceive = 0;
    let cntError = 0;
    const bytes_per_message = 15*1024;
    const message_per_second = mbps*1024*1024/bytes_per_message;
    const msg = new Uint8Array(bytes_per_message);

    channel.onmessage = (ev) => {
        cntReceive += 1;
    }
    channel.onerror = (ev) => {
        cntError += 1;
    }
    const timer1 = setInterval(()=>{
        channel.send(msg);
    }, 1000/message_per_second)
    const timer2 = setInterval(()=>{
        const speed = bytes_per_message * cntReceive / 1024 / 1024;
        console.log(`${cur.toFixed(2)}-${(cur+1).toFixed(2)}\t${message_per_second.toFixed(0)}\t${cntReceive}\t${cntError}\t${speed}`)
        cur+=1
        cntReceive = 0
        cntError = 0
        if(cur == 10){
            channel.close()
            connection.close()
            process.exit()
        }
    }, 1000)
    channel.onclose = (()=>{
        clearInterval(timer1);
        clearInterval(timer2);
        process.exit()
    })
}

async function initialPerf(config: IClientConfig, role: "admin" | "client") {
    const self: IIdentity = {
        name: role,
        role: role,
        room: "speed"
    };

    const createConnection = (config: IClientConfig) => {
        const pc = new nodeDatachannelPolyfill.RTCPeerConnection({
            iceServers: config.ice.servers,
            iceTransportPolicy: config.ice.transport
        });
        if(role == "admin"){
            const ch = pc.createDataChannel("test");
            ch.addEventListener("open", (ev) => { channelPerf(pc, ch, config.video.bitrate);})    
        } else {
            pc.ondatachannel = (ev) => {channelPerf(pc, ev.channel, config.video.bitrate);}
        }
        return pc as any;
    }


    await initializeSocket(defaultServerURL);
    if(role=="admin") initializeWebRTCAdmin(createConnection, self, config, config, console.log);
    else initializeWebRTCClient(createConnection, self, console.log);
}

const role = process.argv.includes("--admin") ? "admin" : "client"
initialPerf(defaultClientConfig, role);

