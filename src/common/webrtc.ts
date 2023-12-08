import { io, connect, Socket } from "socket.io-client";
import { IClientConfig, IIdentity, INetReport } from "./interface";
import ipRegex from 'ip-regex';

let connection: RTCPeerConnection;
let socket: Socket;

export async function initializeSocket(url: string | null) {
    if (url) {
        socket = connect(url, { transports: ["websocket"] });
    } else {
        socket = connect({ transports: ["websocket"] });
    }
}

function browserListeners(self: IIdentity) {
    window.addEventListener("beforeunload", (ev) => {
        socket.close()
        if(connection) connection.close();
    });
    socket.on("refresh", () => window.location.reload())
    window.addEventListener("error", (ev) => {
        socket.emit("webrtc error", self, ev.error.toString());
    });
    window.addEventListener("unhandledrejection", (ev) => {
        socket.emit("webrtc error", self, ev.reason.toString());
    });
    socket.on("webrtc error broadcast", (id, msg) => console.error("[Remote Error]", msg))
}

function cbInitialIceCandidate(connection: RTCPeerConnection, self: IIdentity, config: IClientConfig) {
    return (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate === null) {
            socket.emit("webrtc ice", self, ev.candidate);
            console.info(`[ICE][${self.role}] Removed ICE Listener.`);
            connection.onicecandidate = null;
        } else {
            let flag = true;
            if (config.rtc.peer.iceTransportPolicy != "relay") {
                if (config.rtc.stack == "v4") {
                    flag = ipRegex.v4().test(ev.candidate.address!);
                } else if (config.rtc.stack == "v6") {
                    flag = ipRegex.v6().test(ev.candidate.address!);
                }
            }
            if (flag) {
                socket.emit("webrtc ice", self, ev.candidate);
                console.info(`[ICE][${self.role}] Sent ICE`, ev.candidate);
            } else {
                console.info(`[ICE][${self.role}] Skipped ICE`, ev.candidate);
            }
        }
    }
}

async function initializeWebRTCStats(
    connection: RTCPeerConnection, ms: number = 2000,
    reportConnection: (report: INetReport) => void
) {
    let lastDict: RTCIceCandidatePairStats | null = null;
    await new Promise(r => window.setTimeout(r, ms));
    const timer = window.setInterval(async () => {
        if (connection.iceConnectionState !== "connected") {
            clearInterval(timer);
        } else {
            const report = await connection.getStats();
            let curDict: RTCIceCandidatePairStats | null = null;
            for (const dict of report.values()) {
                if (dict.type === "candidate-pair" && dict.nominated) {
                    if (!curDict || curDict.lastPacketSentTimestamp! < dict.lastPacketSentTimestamp) {
                        curDict = dict;
                    };
                }
            }
            if (lastDict && curDict) {
                if (lastDict.id === curDict.id) {
                    reportConnection({
                        recvMbps: (curDict.lastPacketReceivedTimestamp == lastDict.lastPacketReceivedTimestamp!) ? 0 : (
                            ((curDict.bytesReceived! - lastDict.bytesReceived!) / 1024 / 1024 * 8) /
                            ((curDict.lastPacketReceivedTimestamp! - lastDict.lastPacketReceivedTimestamp!) / 1000)
                        ),
                        sendMbps: (curDict.lastPacketSentTimestamp! == lastDict.lastPacketSentTimestamp!) ? 0 : (
                            ((curDict.bytesSent! - lastDict.bytesSent!) / 1024 / 1024 * 8) /
                            ((curDict.lastPacketSentTimestamp! - lastDict.lastPacketSentTimestamp!) / 1000)
                        ),
                        curDict: curDict,
                        lastDict: lastDict
                    });
                } else {
                    reportConnection({
                        recvMbps: -1,
                        sendMbps: -1,
                        curDict: curDict,
                        lastDict: lastDict
                    })
                }
            }
            lastDict = curDict;
        }
    }, ms)
}

function cbInitialConnected(
    connection: RTCPeerConnection, self: IIdentity, other: IIdentity,
    updateProgress: ((state: string) => void) | null,
    postConnection: ((connection: RTCPeerConnection) => void) | null,
    reportConnection: null | ((report: INetReport) => void)
) {
    return (ev) => {
        console.info(`[RTC][2.1][${self.role}] Connected to`, other);
        connection.onconnectionstatechange = null;
        if (updateProgress) updateProgress(other.name);
        if (postConnection) postConnection(connection);
        if (reportConnection) initializeWebRTCStats(connection, 2000, reportConnection);
    }
}

export function initializeWebRTCAdmin(
    self: IIdentity, adminConfig: IClientConfig, clientConfig: IClientConfig,
    createConnection: (config: IClientConfig) => Promise<RTCPeerConnection>,
    updateProgress: ((state: string) => void) | null = null,
    postConnection: ((connection: RTCPeerConnection) => void) | null = null,
    reportConnection: null | ((report: INetReport) => void) = null
) {
    socket.removeAllListeners();

    let config: IClientConfig;
    let iceQueue: RTCIceCandidateInit[] = [];

    socket.on("room ready broadcast", async (room: string) => {
        console.clear();

        console.info(`[RTC][0.0][Admin] Received Ready from ${room}`);

        config = adminConfig;
        console.info(`[RTC][0.1][Admin] Chosen config`, config);

        if (updateProgress) updateProgress("Creating Connection...");
        if (connection) connection.close();
        connection = await createConnection(config);
        console.info(`[RTC][0.2][Admin] Prepared PeerConnection`, connection);

        if (updateProgress) updateProgress("Creating Offer...");
        const offer = await connection.createOffer();
        connection.onicecandidate = cbInitialIceCandidate(connection, self, config);
        await connection.setLocalDescription(offer);
        socket.emit("webrtc offer", self, clientConfig, offer);
        console.info(`[RTC][0.3][Admin] Created, Set and Sent Offer`, offer);

        if (updateProgress) updateProgress("Waiting for Answer...");
    })

    socket.on("webrtc answer broadcast", async (other: IIdentity, answer: RTCSessionDescriptionInit) => {
        console.info(`[RTC][2.0][Admin] Received Client Answer`, answer);

        if (updateProgress) updateProgress("Setting Internal States...");
        await connection.setRemoteDescription(answer);
        console.info(`[RTC][2.2][Admin] Set Answer`, answer);

        if (updateProgress) updateProgress("Waiting for Connection...");
        connection.onconnectionstatechange = cbInitialConnected(connection, self, other, updateProgress, postConnection, reportConnection);
        for (const ice of iceQueue) {
            console.info(`[ICE][Admin] Consumed ICE From Queue`, ice);
            connection.addIceCandidate(ice);
        }
    })

    socket.on("webrtc ice broadcast", (other: IIdentity, ice: RTCIceCandidateInit) => {
        if (connection) {
            if (connection.remoteDescription) {
                console.info(`[ICE][Admin] Consumed ICE Directly`, ice);
                connection.addIceCandidate(ice);
            } else {
                console.info(`[ICE][Admin] Queued ICE`, ice);
                iceQueue.push(ice);
            }
        }
    })

    socket.on("room full message", (room) => {
        socket.removeAllListeners();
        throw "Room is full";
    });

    if (typeof window !== "undefined") browserListeners(self);
    if (updateProgress) updateProgress("Waiting for Client...");
    socket.emit("room join", self);
}

export function initializeWebRTCClient(
    self: IIdentity,
    createConnection: (config: IClientConfig) => Promise<RTCPeerConnection>,
    updateProgress: ((state: string) => void) | null = null,
    postConnection: ((connection: RTCPeerConnection) => void) | null = null,
    reportConnection: null | ((report: INetReport) => void) = null
) {
    socket.removeAllListeners();

    let config: IClientConfig;
    let iceQueue: RTCIceCandidateInit[] = [];

    socket.on("webrtc offer broadcast", async (other: IIdentity, clientConfig: IClientConfig, offer: RTCSessionDescriptionInit) => {
        console.clear();

        console.info(`[RTC][1.0][Client] Received config and offer`);

        config = clientConfig;
        console.info(`[RTC][1.1][Client] Chosen config`, config);

        if (updateProgress) updateProgress("Creating Connection...");
        if (connection) connection.close();
        connection = await createConnection(config);
        console.info(`[RTC][1.2][Client] Prepared PeerConnection`, connection);

        if (updateProgress) updateProgress("Setting Internal States...");

        await connection.setRemoteDescription(offer);
        const answer = await connection.createAnswer();
        connection.onicecandidate = cbInitialIceCandidate(connection, self, config);
        await connection.setLocalDescription(answer);
        socket.emit("webrtc answer", self, answer);
        console.info(`[RTC][1.4][Client] Created, Set and Sent Answer`, answer);


        if (updateProgress) updateProgress("Waiting for Connection...");
        for (const ice of iceQueue) {
            console.info(`[ICE][Client] Consumed ICE From Queue`, ice);
            connection.addIceCandidate(ice);
        }

        connection.onconnectionstatechange = cbInitialConnected(connection, self, other, updateProgress, postConnection, reportConnection);
    })

    socket.on("webrtc ice broadcast", (other: IIdentity, ice: RTCIceCandidateInit) => {
        if (connection) {
            if (connection.remoteDescription) {
                console.info(`[ICE][Client] Consumed ICE Directly`, ice);
                connection.addIceCandidate(ice);
            } else {
                console.info(`[ICE][Client] Queued ICE`, ice);
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

    if (typeof window !== "undefined") browserListeners(self);
    if (updateProgress) updateProgress("Waiting for Admin...");
    socket.emit("room join", self);
}