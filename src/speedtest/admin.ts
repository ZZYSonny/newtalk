import nodeDatachannelPolyfill from 'node-datachannel/polyfill';
import {initializeWebRTCAdmin} from "../common/webrtc";
import {defaultClientConfig} from "../common/defaults_eg"


initializeWebRTCAdmin(
    (config) => {
        const pc = new nodeDatachannelPolyfill.RTCPeerConnection({
            iceServers: [
                {urls: "stun:stun.l.google.com:19302"}
            ]
        });
        const ch = pc.createDataChannel("test");
        ch.addEventListener("open", (ev) => {
            console.log("Channel Opened");
            setInterval(() => ch.send("Hello World"), 1000)
        })
        return pc as any;
    }, {
        name: "Admin",
        role: "admin",
        room: "speed"
    }, defaultClientConfig, defaultClientConfig, console.log
)