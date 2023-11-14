import { IClientConfig, configFromURL, idFromURL } from "../common/interface";
import { initialPerfAdmin, initialPerfClient } from "../common/speedtest";
import { initializeSocket, initializeWebRTCAdmin, initializeWebRTCClient } from "../common/webrtc";
import { defaultClientConfig } from "./defaults_private";

const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;
const speedOutput = document.getElementById("speedOutput") as HTMLSpanElement;

const id = idFromURL();

function createConnection(config: IClientConfig){
    return new RTCPeerConnection({
        iceServers: config.ice.servers,
        iceTransportPolicy: config.ice.transport
    });
}

async function initCall() {
    stateCaption.textContent = "Connecting to Server...";
    await initializeSocket(null);
    stateCaption.textContent = "Parsing Config...";

    if (id.role === "admin") {
        const allConfig = configFromURL("all", defaultClientConfig);
        const connection = await initialPerfAdmin (
            allConfig, createConnection, 
            (s) => stateCaption.textContent = s,
            (s) => speedOutput.textContent += s
        );
    } else if (id.role === "client") {
        const connection = await initialPerfClient(
            createConnection,
            (s) => stateCaption.textContent = s,
            (s) => speedOutput.innerHTML += s.replaceAll("\t","&emsp;&emsp;") + "<br>"
        );
    }
}

initCall()