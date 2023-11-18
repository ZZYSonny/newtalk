import nodeDatachannel from 'node-datachannel';
import nodeDatachannelPolyfill from 'node-datachannel/polyfill';

import { defaultClientConfig, defaultServerURL } from "./defaults_private"
import { IClientConfig } from '../common/interface';
import { initializeSocket } from '../common/webrtc';
import { initialPerfAdmin, initialPerfClient } from '../common/speedtest';

// Disable webrtc.ts logging
console.info = (...args) =>{};
nodeDatachannel.initLogger("Warning")

function createConnection(config: IClientConfig){
    return new nodeDatachannelPolyfill.RTCPeerConnection(config.rtc.peer);
}


async function main(){
    await initializeSocket(defaultServerURL);
    if(process.argv.includes("--admin")){
        await initialPerfAdmin(defaultClientConfig, createConnection, console.log, console.log);
    } else {
        await initialPerfClient(createConnection, console.log, console.log);
    }
}

main()