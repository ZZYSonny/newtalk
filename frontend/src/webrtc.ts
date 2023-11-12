import { io, Socket } from "socket.io-client";
import {IClientConfig, IIdentity} from "./interface.ts";
import ipRegex from 'ip-regex';

const socket = io();
window.addEventListener("beforeunload", (ev) => socket.close());


export function initializeWebRTCAdmin(createConnection: (pc: RTCPeerConnection, config: IClientConfig) => Promise<RTCPeerConnection>, self: IIdentity, adminConfig: IClientConfig, clientConfig: IClientConfig, updateProgress: ((state: string) => void) | null = null) {
    let connection: RTCPeerConnection;
    let config: IClientConfig;

    return new Promise((resolve, reject) => {
        socket.on("room ready broadcast", async (room: string) => {
            console.clear();

            console.log(`[RTC][Initial][0.0][Admin] Received Ready from ${room}`);

            config = adminConfig;
            console.log(`[RTC][Initial][0.1][Admin] Chosen config`, config);

            if (updateProgress) updateProgress("Creating Connection...");
            connection = new RTCPeerConnection({
                iceServers: config.ice.servers,
                iceTransportPolicy: config.ice.transport
            });        
            await createConnection(connection, config);
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
                let skip = false;   
                const candidate = ev.candidate;         
                
                if (candidate === null) {
                    console.log(`[RTC][Initial][2.4][Admin] Removed icecandidate listener`);
                    connection.removeEventListener("icecandidate", onIceCandidateCB);
                } else {
                    if(config.ice.stack == "v4"){
                        skip = ipRegex.v6().test(candidate.address!)
                    } else if(config.ice.stack == "v6"){
                        skip = ipRegex.v4().test(candidate.address!)
                    }
                }

                if(skip){
                    console.log(`[RTC][Initial][2.3][Admin] Skipped ICE`, ev.candidate);   
                }else{
                    socket.emit("webrtc initial ice", self, ev.candidate);
                    console.log(`[RTC][Initial][2.3][Admin] Sent ICE`, ev.candidate);    
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

export function initializeWebRTCClient(createConnection: (pc: RTCPeerConnection, config: IClientConfig) => Promise<RTCPeerConnection>, self: IIdentity, updateProgress: ((state: string) => void) | null = null) {
    let connection: RTCPeerConnection;
    let config: IClientConfig;

    return new Promise((resolve, reject) => {
        socket.on("webrtc initial offer broadcast", async (other: IIdentity, clientConfig: IClientConfig, offer: RTCSessionDescriptionInit) => {
            console.clear();

            console.log(`[RTC][Initial][1.0][Client] Received config and offer`, clientConfig, offer);

            config = clientConfig;
            console.log(`[RTC][Initial][1.1][Client] Chosen config`, config);

            if (updateProgress) updateProgress("Creating Connection...");
            connection = new RTCPeerConnection({
                iceServers: config.ice.servers,
                iceTransportPolicy: config.ice.transport
            });        
            await createConnection(connection, config);
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
