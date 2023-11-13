import { io, connect, Socket } from "socket.io-client";
import { IClientConfig, IIdentity } from "./interface";
import ipRegex from 'ip-regex';

let connection: RTCPeerConnection;
let socket: Socket;

export async function initializeSocket(url: string | null) {
    if(url){
        socket = connect(url);
    } else {
        socket = connect();
        window.addEventListener("beforeunload", (ev) => socket.close());
    }
}

function cbInitialIceCandidate(connection: RTCPeerConnection, self: IIdentity, config: IClientConfig) {
    return (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate === null) {
            socket.emit("webrtc initial ice", self, ev.candidate);
            console.debug(`[ICE][Initial][${self.role}] Removed ICE Listener.`);
            connection.onicecandidate = null;
        } else {
            let skip = config.ice.stack == "v4" ? ipRegex.v6().test(ev.candidate.address!) :
                config.ice.stack == "v6" ? ipRegex.v4().test(ev.candidate.address!) :
                    false;
            if (skip) {
                console.debug(`[ICE][Initial][${self.role}] Skipped ICE`, ev.candidate);
            } else {
                socket.emit("webrtc initial ice", self, ev.candidate);
                console.debug(`[ICE][Initial][${self.role}] Sent ICE`, ev.candidate);
            }
        }
    }
}

function cbInitialConnected(connection: RTCPeerConnection, self: IIdentity, other: IIdentity, updateProgress: null | ((name: string) => void)){
    return (ev) => {
        console.debug(`[RTC][Initial][2.1][${self.role}] Connected to`, other);
        if (updateProgress) updateProgress(other.name);
        connection.onconnectionstatechange = null;
    }
}

export function initializeWebRTCAdmin(createConnection: (config: IClientConfig) => Promise<RTCPeerConnection>, self: IIdentity, adminConfig: IClientConfig, clientConfig: IClientConfig, updateProgress: ((state: string) => void) | null = null) {
    let config: IClientConfig;
    let iceQueue: RTCIceCandidateInit[] = [];

    return new Promise((resolve, reject) => {
        socket.on("room ready broadcast", async (room: string) => {
            console.clear();
            
            console.debug(`[RTC][Initial][0.0][Admin] Received Ready from ${room}`);

            config = adminConfig;
            console.debug(`[RTC][Initial][0.1][Admin] Chosen config`, config);

            if (updateProgress) updateProgress("Creating Connection...");
            if(connection) connection.close();
            connection = await createConnection(config);
            connection.onicecandidate = cbInitialIceCandidate(connection, self, config);
            connection.onnegotiationneeded = async (ev) => {
                if (updateProgress) updateProgress("Creating Offer...");
                const offer = await connection.createOffer();
                socket.emit("webrtc initial offer", self, clientConfig, offer);
                console.debug(`[RTC][Initial][0.3][Admin] Created and Sent Offer`, offer);
    
                if (updateProgress) updateProgress("Waiting for Answer...");                
                connection.onnegotiationneeded = null; 
            }
            console.debug(`[RTC][Initial][0.2][Admin] Prepared PeerConnection`, connection);
            resolve(connection);
        })

        socket.on("webrtc initial answer broadcast", async (other: IIdentity, answer: RTCSessionDescriptionInit, offer: RTCSessionDescriptionInit) => {
            console.debug(`[RTC][Initial][2.0][Admin] Received Client Answer in response to Offer`, answer, offer);

            if (updateProgress) updateProgress("Setting Internal States...");
            await connection.setLocalDescription(offer);
            console.debug(`[RTC][Initial][2.1][Admin] Set Offer`, answer);
            await connection.setRemoteDescription(answer);
            console.debug(`[RTC][Initial][2.2][Admin] Set Answer`, answer);

            if (updateProgress) updateProgress("Waiting for Connection...");
            connection.onconnectionstatechange = cbInitialConnected(connection, self, other, updateProgress);
            for(const ice of iceQueue){
                console.debug(`[ICE][Initial][Admin] Consumed ICE From Queue`, ice);
                connection.addIceCandidate(ice);
            }
        })

        socket.on("webrtc initial ice broadcast", (other: IIdentity, ice: RTCIceCandidateInit) => {
            if(connection){
                if(connection.remoteDescription){
                    console.debug(`[ICE][Initial][Admin] Consumed ICE Directly`, ice);
                    connection.addIceCandidate(ice);
                } else {
                    console.debug(`[ICE][Initial][Admin] Queued ICE`, ice);
                    iceQueue.push(ice);
                }
            }
        })

        socket.on("room full message", (room) => {
            socket.removeAllListeners();
            throw "Room is full";
        });

        if (updateProgress) updateProgress("Waiting for Client...");
        socket.emit("room join", self);
    })
}

export function initializeWebRTCClient(createConnection: (config: IClientConfig) => Promise<RTCPeerConnection>, self: IIdentity, updateProgress: ((state: string) => void) | null = null) {
    let config: IClientConfig;
    let iceQueue: RTCIceCandidateInit[] = [];

    return new Promise((resolve, reject) => {
        socket.on("webrtc initial offer broadcast", async (other: IIdentity, clientConfig: IClientConfig, offer: RTCSessionDescriptionInit) => {
            console.clear();

            console.debug(`[RTC][Initial][1.0][Client] Received config and offer`);

            config = clientConfig;
            console.debug(`[RTC][Initial][1.1][Client] Chosen config`, config);

            if (updateProgress) updateProgress("Creating Connection...");
            if(connection) connection.close();
            connection = await createConnection(config);
            connection.onicecandidate = cbInitialIceCandidate(connection, self, config);
            
            console.debug(`[RTC][Initial][1.2][Client] Prepared PeerConnection`, connection);
            resolve(connection);

            if (updateProgress) updateProgress("Setting Internal States...");

            await connection.setRemoteDescription(offer);
            console.debug(`[RTC][Initial][1.3][Client] Set Offer`, offer);

            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            socket.emit("webrtc initial answer", self, answer, offer);
            console.debug(`[RTC][Initial][1.4][Client] Created and Set and Sent Answer`, answer);


            if (updateProgress) updateProgress("Waiting for Connection...");
            for(const ice of iceQueue){
                console.debug(`[ICE][Initial][Client] Consumed ICE From Queue`, ice);
                connection.addIceCandidate(ice);
            }
            const onConnectionCallback = (ev: Event) => {
                console.debug(`[RTC][Initial][2.1][Client] Connected to`, other);
                if (updateProgress) updateProgress(other.name);
                connection.removeEventListener("connectionstatechange", onConnectionCallback);
                resolve(connection);
            }
            connection.addEventListener("connectionstatechange", onConnectionCallback)
        })

        socket.on("webrtc initial ice broadcast", (other: IIdentity, ice: RTCIceCandidateInit) => {
            if(connection){
                if(connection.remoteDescription){
                    console.debug(`[ICE][Initial][Client] Consumed ICE`, ice);
                    connection.addIceCandidate(ice);
                } else {
                    console.debug(`[ICE][Initial][Client] Queued ICE`, ice);
                    iceQueue.push(ice);
                }
            }
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
