import { io, connect, Socket } from "socket.io-client";
import { IClientConfig, IClientStatsConfig, IIdentity, INetReport } from "./interface";
import ipRegex from 'ip-regex';

let connection: RTCPeerConnection;
export let socket: Socket;

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
        if (connection) connection.close();
    });
    socket.on("page refresh", () => window.location.reload())
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

export function createConnectionFromStream(
    self: IIdentity, config: IClientConfig, localStream: MediaStream,
    useRemoteStream: (stream: MediaStream) => void
){
    console.log(`[Video][0][${self.role}] Using config`, config, config)
    const pc = new RTCPeerConnection(config.rtc.peer);

    // Send Video
    localStream.getTracks().forEach((track) => {
        console.log(`[Video][1][${self.role}] Sending RTC Track Type ${track.kind}`)
        pc.addTrack(track, localStream);
    });

    // Receive Video
    pc.ontrack = (ev) => {
        console.log(`[Video][2][${self.role}] Receiving RTC Track Type ${ev.track.kind}`)
        if (ev.track.kind == "video") {
            useRemoteStream(ev.streams[0]);
        }
    }

    // Set Preferred video codec
    const videoTransceiver = pc.getTransceivers().find((s) => (s.sender.track ? s.sender.track.kind === 'video' : false))!;
    const supportVideoCodec = RTCRtpSender.getCapabilities('video')!.codecs;
    const selectedVideoCodec = config.video.codecs.map((name) => supportVideoCodec.filter((codec) => codec.mimeType.includes(name))).flat();
    videoTransceiver.setCodecPreferences(selectedVideoCodec);

    // Set Preferred bitrate
    const videoSender = videoTransceiver.sender;
    const videoParameters = videoSender.getParameters();
    videoParameters.encodings[0].maxBitrate = config.video.bitrate * 1000000;
    videoSender.setParameters(videoParameters);

    return pc;
}

async function initializeWebRTCStats(
    connection: RTCPeerConnection, config: IClientStatsConfig,
    reportConnection: (report: INetReport) => void
) {
    const history = new Map<string, number>();
    await new Promise(r => window.setTimeout(r, config.delay*1000));
    const timer = window.setInterval(async () => {
        if (connection.iceConnectionState === "closed") {
            clearInterval(timer);
        } else {
            const curStats = await connection.getStats();

            let curSent = 0;
            let curRecv = 0;
            let curLoss = 0;
            let lastSent = 0;
            let lastRecv = 0;
            let lastLoss = 0;
            let curSentMaxBandwidth = 0;        

            for (const dict of curStats.values()) {
                if (dict.type === "candidate-pair" && dict.nominated && dict.state === "succeeded") {
                    console.info(`[Perf] Using ${dict.id}`);
                    if(dict.bytesReceived) {
                        lastSent += history.get(dict.id + "bytesReceived") || 0;
                        curSent += dict.bytesReceived;
                        history.set(dict.id + "bytesReceived", dict.bytesReceived)
                    }
                    if(dict.bytesSent){
                        lastRecv += history.get(dict.id + "bytesSent") || 0;
                        curRecv += dict.bytesSent;
                        history.set(dict.id + "bytesSent", dict.bytesSent)
                    }
                    if(dict.packetsDiscardedOnSend){
                        lastLoss += history.get(dict.id + "packetsDiscardedOnSend") || 0;
                        curLoss += dict.packetsDiscardedOnSend;
                        history.set(dict.id + "packetsDiscardedOnSend", dict.packetsDiscardedOnSend)
                    }
                    if(dict.availableOutgoingBitrate) {
                        curSentMaxBandwidth += dict.availableOutgoingBitrate;
                    }
                }
            }
            let MbpsRecv = ((curRecv - lastRecv) / 1024 / 1024 * 8) / config.interval;
            let MbpsSent = ((curSent - lastSent) / 1024 / 1024 * 8) / config.interval;
            let MbpsSentMax = curSentMaxBandwidth / 1024 / 1024;
            let PercSentLoss = (curLoss - lastLoss) / (curSent - lastSent);
            let summary: string[] = []
            let formatter = (x: number) => (x>10) ? x.toFixed(0) : x.toFixed(1);

            if (MbpsRecv>0 || MbpsSent>0 || MbpsSentMax>0 || PercSentLoss>0) {
                summary.push(`${formatter(MbpsRecv)}↓`);
                summary.push(`${formatter(MbpsSent)}↑`);
                summary.push(`(${formatter(MbpsSentMax)})`);                
                summary.push(`${formatter(PercSentLoss)}%`);

                reportConnection({
                    id: 0,
                    inMbps: MbpsRecv,
                    outMbps: MbpsSent,
                    outMaxMbps: MbpsSentMax,
                    outLoss: PercSentLoss,
                    summary: summary
                })
            }
            lastSent = curSent;
            lastRecv = curRecv;
            lastLoss = curLoss;
        }
    }, config.interval * 1000)
}

function cbInitialConnected(
    connection: RTCPeerConnection, self: IIdentity, other: IIdentity, config: IClientConfig,
    updateProgress: ((state: string) => void) | null,
    postConnection: ((connection: RTCPeerConnection) => void) | null,
    reportConnection: null | ((report: INetReport) => void)
) {
    return (ev) => {
        console.info(`[RTC][2.1][${self.role}] Connected to`, other);
        connection.onconnectionstatechange = null;
        if (updateProgress) updateProgress(other.name);
        if (postConnection) postConnection(connection);
        if (reportConnection) initializeWebRTCStats(connection, config.rtc.stats, reportConnection);
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
        connection.onconnectionstatechange = cbInitialConnected(connection, self, other, config, updateProgress, postConnection, reportConnection);
        for (const ice of iceQueue) {
            console.info(`[ICE][Admin] Consumed ICE From Queue`, ice);
            connection.addIceCandidate(ice);
        }
    })

    socket.on("webrtc ice broadcast", (other: IIdentity, ice: RTCIceCandidateInit) => {
        if (connection && connection.connectionState !== "closed" && connection.remoteDescription) {
            console.info(`[ICE][Admin] Consumed ICE Directly`, ice);
            connection.addIceCandidate(ice);
        } else {
            console.info(`[ICE][Admin] Queued ICE`, ice);
            iceQueue.push(ice);
        }
    })

    socket.on("room full message", (room) => {
        socket.removeAllListeners();
        alert("Room is full");
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

        connection.onconnectionstatechange = cbInitialConnected(connection, self, other, config, updateProgress, postConnection, reportConnection);
    })

    socket.on("webrtc ice broadcast", (other: IIdentity, ice: RTCIceCandidateInit) => {
        if (connection && connection.connectionState !== "closed" && connection.remoteDescription) {
            console.info(`[ICE][Client] Consumed ICE Directly`, ice);
            connection.addIceCandidate(ice);
        } else {
            console.info(`[ICE][Client] Queued ICE`, ice);
            iceQueue.push(ice);
        }
    })

    socket.on("room full message", () => {
        socket.removeAllListeners();
        alert("Room is full");
        throw ("Room is full");
    });

    socket.on("room ready broadcast", (room: string) => {
        if (updateProgress) updateProgress("Waiting for Offer...");
    })

    if (typeof window !== "undefined") browserListeners(self);
    if (updateProgress) updateProgress("Waiting for Admin...");
    socket.emit("room join", self);
}