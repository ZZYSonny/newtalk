import { io, Socket } from "socket.io-client";
const socket = io();
window.addEventListener("beforeunload", (ev) => socket.close());

export interface IIdentity {
    name: string,
    room: string,
    role: string
}

export function initializeWebRTCAdmin<T>(createConnection: (config: T) => Promise<RTCPeerConnection>, id: IIdentity, adminConfig: T, clientConfig: T) {
    let connection: RTCPeerConnection;
    let config: T;

    socket.on("room ready broadcast", async (room: string) => {
        console.clear();

        console.log(`[RTC][Initial][0.0][Admin] Received Ready from ${room}`);

        config = adminConfig;
        console.log(`[RTC][Initial][0.1][Admin] Chosen config`, config);

        connection = await createConnection(config);
        console.log(`[RTC][Initial][0.2][Admin] Prepared PeerConnection`, connection);

        const offer = await connection.createOffer();
        console.log(`[RTC][Initial][0.3][Admin] Created Offer`, offer);

        socket.emit("webrtc initial offer", id, clientConfig, offer);
        console.log(`[RTC][Initial][0.4][Admin] Sent config and offer`);
        // Create offer
    })

    socket.on("webrtc initial answer broadcast", async (answer: RTCSessionDescriptionInit, offer: RTCSessionDescriptionInit) => {
        console.log(`[RTC][Initial][2.0][Admin] Received Client Answer in response to Offer`, answer, offer);

        connection.addEventListener("icecandidate", (ev) => {
            socket.emit("webrtc initial ice", id, ev.candidate);
            console.log(`[RTC][Initial][2.3][Admin] Sent ICE`, ev.candidate);
            if(ev.candidate === null){
                console.log(`[RTC][Initial][2.4][Admin] Removed icecandidate listener`);
                connection.removeEventListener("icecandidate", this);
            }
        });

        await connection.setLocalDescription(offer);
        console.log(`[RTC][Initial][2.1][Admin] Set Offer`, answer);
        await connection.setRemoteDescription(answer);
        console.log(`[RTC][Initial][2.2][Admin] Set Answer`, answer);
    })

    socket.on("room full message", (room) => {
        socket.removeAllListeners();
        throw "Room is full";
    });

    socket.emit("room join", id);
}

export function initializeWebRTCClient<T>(createConnection: (config: T) => Promise<RTCPeerConnection>, id: IIdentity) {
    let connection: RTCPeerConnection;
    let config: T;

    socket.on("webrtc initial offer broadcast", async (clientConfig: T, offer: RTCSessionDescriptionInit) => {
        console.clear();

        console.log(`[RTC][Initial][1.0][Client] Received config and offer`, clientConfig, offer);

        config = clientConfig;
        console.log(`[RTC][Initial][1.1][Client] Chosen config`, config);

        connection = await createConnection(config);
        console.log(`[RTC][Initial][1.2][Client] Prepared PeerConnection`, connection);

        await connection.setRemoteDescription(offer);
        console.log(`[RTC][Initial][1.3][Client] Set Offer`, offer);

        const answer = await connection.createAnswer();
        console.log(`[RTC][Initial][1.4][Client] Created Answer`, answer);

        await connection.setLocalDescription(answer);
        console.log(`[RTC][Initial][1.5][Client] Set Answer`, answer);
        
        socket.emit("webrtc initial answer", id, answer, offer);
        console.log(`[RTC][Initial][1.6][Client] Sent Answer in response to Offer`, answer, offer);
    })

    socket.on("webrtc initial ice broadcast", async (candidate: RTCIceCandidate) => {
        console.log(`[RTC][Initial][3.0][Client] Received ICE Candidate`, candidate);
        await connection.addIceCandidate(candidate);
    })

    socket.on("room full message", () => {
        socket.removeAllListeners();
        throw ("Room is full");
    });

    socket.emit("room join", id);
}
