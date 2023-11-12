import { io, Socket } from "socket.io-client";
const socket = io();
window.addEventListener("beforeunload", (ev) => socket.close());

export interface IIdentity {
    name: string,
    room: string,
    role: string
}

export function initializeWebRTCAdmin<T>(updateProgress: (state: string) => void | null, createConnection: (config: T) => Promise<RTCPeerConnection>, self: IIdentity, adminConfig: T, clientConfig: T) {
    let connection: RTCPeerConnection;
    let config: T;

    return new Promise((resolve, reject) => {
        socket.on("room ready broadcast", async (room: string) => {
            console.clear();

            console.log(`[RTC][Initial][0.0][Admin] Received Ready from ${room}`);

            config = adminConfig;
            console.log(`[RTC][Initial][0.1][Admin] Chosen config`, config);

            if (updateProgress) updateProgress("Creating Connection...");
            connection = await createConnection(config);
            console.log(`[RTC][Initial][0.2][Admin] Prepared PeerConnection`, connection);

            if (updateProgress) updateProgress("Creating Offer...");
            const offer = await connection.createOffer();
            console.log(`[RTC][Initial][0.3][Admin] Created Offer`, offer);

            if (updateProgress) updateProgress("Waiting for Answer...");
            socket.emit("webrtc initial offer", self, clientConfig, offer);
            console.log(`[RTC][Initial][0.4][Admin] Sent config and offer`);
            // Create offer
        })

        socket.on("webrtc initial answer broadcast", async (other: IIdentity, answer: RTCSessionDescriptionInit, offer: RTCSessionDescriptionInit) => {
            console.log(`[RTC][Initial][2.0][Admin] Received Client Answer in response to Offer`, answer, offer);

            const onIceCandidateCB = (ev: RTCPeerConnectionIceEvent) => {
                socket.emit("webrtc initial ice", self, ev.candidate);
                console.log(`[RTC][Initial][2.3][Admin] Sent ICE`, ev.candidate);
                if (ev.candidate === null) {
                    console.log(`[RTC][Initial][2.4][Admin] Removed icecandidate listener`);
                    connection.removeEventListener("icecandidate", onIceCandidateCB);
                }
            };
            connection.addEventListener("icecandidate", onIceCandidateCB);

            if (updateProgress) updateProgress("Setting Internal States...");
            await connection.setLocalDescription(offer);
            console.log(`[RTC][Initial][2.1][Admin] Set Offer`, answer);
            await connection.setRemoteDescription(answer);
            console.log(`[RTC][Initial][2.2][Admin] Set Answer`, answer);

            if (updateProgress) updateProgress("Waiting for Connection...");
            const onConnectionCallback = (ev: Event) => {
                console.log(`[RTC][Initial][2.1][Admin] Connected to`, other);
                if (updateProgress) updateProgress(other.name);
                connection.removeEventListener("connectionstatechange", onConnectionCallback);
                resolve(connection);
            }
            connection.addEventListener("connectionstatechange", onConnectionCallback)
        })

        socket.on("room full message", (room) => {
            socket.removeAllListeners();
            throw "Room is full";
        });

        if (updateProgress) updateProgress("Waiting for Client...");
        socket.emit("room join", self);
    })
}

export function initializeWebRTCClient<T>(updateProgress: (state: string) => void, createConnection: (config: T) => Promise<RTCPeerConnection>, self: IIdentity) {
    let connection: RTCPeerConnection;
    let config: T;

    return new Promise((resolve, reject) => {
        socket.on("webrtc initial offer broadcast", async (other: IIdentity, clientConfig: T, offer: RTCSessionDescriptionInit) => {
            console.clear();

            console.log(`[RTC][Initial][1.0][Client] Received config and offer`, clientConfig, offer);

            config = clientConfig;
            console.log(`[RTC][Initial][1.1][Client] Chosen config`, config);

            if (updateProgress) updateProgress("Creating Connection...");
            connection = await createConnection(config);
            console.log(`[RTC][Initial][1.2][Client] Prepared PeerConnection`, connection);

            if (updateProgress) updateProgress("Setting Internal States...");
            await connection.setRemoteDescription(offer);
            console.log(`[RTC][Initial][1.3][Client] Set Offer`, offer);

            const answer = await connection.createAnswer();
            console.log(`[RTC][Initial][1.4][Client] Created Answer`, answer);

            await connection.setLocalDescription(answer);
            console.log(`[RTC][Initial][1.5][Client] Set Answer`, answer);

            socket.emit("webrtc initial answer", self, answer, offer);
            console.log(`[RTC][Initial][1.6][Client] Sent Answer in response to Offer`, answer, offer);

            if (updateProgress) updateProgress("Waiting for Connection...");
            const onConnectionCallback = (ev: Event) => {
                console.log(`[RTC][Initial][2.1][Client] Connected to`, other);
                if (updateProgress) updateProgress(other.name);
                connection.removeEventListener("connectionstatechange", onConnectionCallback);
                resolve(connection);
            }
            connection.addEventListener("connectionstatechange", onConnectionCallback)
        })

        socket.on("webrtc initial ice broadcast", async (other: IIdentity, candidate: RTCIceCandidate) => {
            console.log(`[RTC][Initial][3.0][Client] Received ICE Candidate`, candidate);
            await connection.addIceCandidate(candidate);
        })

        socket.on("room full message", () => {
            socket.removeAllListeners();
            throw ("Room is full");
        });

        socket.on("room ready broadcast", (room: string) => {
            if (updateProgress) updateProgress("Waiting for Offer...");
        })

        if (updateProgress) updateProgress("Waiting for Admin...");
        socket.emit("room join", self);
    })
}
