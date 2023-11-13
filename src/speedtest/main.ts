import nodeDatachannelPolyfill from 'node-datachannel/polyfill';
import { initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient } from "../common/webrtc";
import { defaultClientConfig, defaultServerURL } from "../common/defaults_eg"
import { IClientConfig, IIdentity } from '../common/interface';

// Disable webrtc.ts logging
console.info = (...args) =>{};



async function channelPerf(channel: RTCDataChannel) {
    console.log("Channel Opened")
    channel.send("HelloWorld");
    channel.onmessage = (ev) => {
        console.log(ev.data);
    }
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
            ch.addEventListener("open", (ev) => { channelPerf(ch);})    
        } else {
            pc.ondatachannel = (ev) => {channelPerf(ev.channel);}
        }
        return pc as any;
    }


    await initializeSocket(defaultServerURL);
    if(role=="admin") initializeWebRTCAdmin(createConnection, self, config, config, console.log);
    else initializeWebRTCClient(createConnection, self, console.log);
}

if(process.argv.includes("--admin")) initialPerf(defaultClientConfig, "admin");
else if(process.argv.includes("--client")) initialPerf(defaultClientConfig, "client");
