import nodeDatachannelPolyfill from 'node-datachannel/polyfill';
import {initializeWebRTCClient} from "../common/webrtc";
import {defaultClientConfig} from "../common/defaults_eg"


initializeWebRTCClient(
    (config) => {
        const pc = new nodeDatachannelPolyfill.RTCPeerConnection({
            iceServers: [
                {urls: "stun:stun.l.google.com:19302"}
            ]
        });
        pc.addEventListener("datachannel", (ev) => {
            const ch = ev.channel;
            ch.addEventListener("message", (ev) => {
                console.log(ev.data)
            });
        })
    return pc as any;
    }, {
        name: "Client",
        role: "client",
        room: "speed"
    }, console.log
)