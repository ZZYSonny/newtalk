import { io, connect, Socket } from "socket.io-client";
import { IClientConfig, IClientStatsConfig, IIdentity, INetReport } from "./interface";
import ipRegex from 'ip-regex';

let connection: RTCPeerConnection;
export let socket: Socket;

/**
 * Modify SDP to tune congestion control:
 * - Injects b=AS: / b=TIAS: using config.video.minBitrate to give GCC a
 *   floor — the encoder won't starve even under loss, avoiding frame freezes.
 * - Sets x-google-start-bitrate to minBitrate so the encoder starts at the
 *   floor immediately instead of Chrome's ~300 kbps default.
 * - Sets x-google-max-bitrate to config.video.maxBitrate so GCC can probe
 *   upward and discover actual bandwidth between the floor and the cap.
 * - Sets x-google-min-bitrate to config.video.minBitrate so the encoder
 *   has room to scale down when necessary.
 */
function modifySDP(sdp: string, config: IClientConfig): string {
    // Apply the existing useinbandfec/usedtx modification
    sdp = sdp.replace("useinbandfec=1", "useinbandfec=1;usedtx=1");

    // Floor bandwidth that GCC treats as always available, derived from
    // config.video.minBitrate.  GCC probes upward from here to discover
    // the true link capacity, capped by maxBitrate.
    // config.video.minBitrate is in Mbps — convert to kbps (b=AS) and bps.
    const floorKbps = config.video.minBitrate * 1000;
    const floorBps  = config.video.minBitrate * 1000000;

    const lines = sdp.split('\r\n');
    const result: string[] = [];
    let inVideoSection = false;
    let cLineSeenInVideo = false;

    // Track video payload types and their existing rtcp-fb lines so we can
    // inject missing nack / nack pli when leaving the video section.
    const videoPayloadTypes = new Set<string>();
    const seenNack = new Set<string>();
    const seenNackPli = new Set<string>();

    for (const line of lines) {
        // Track which media section we're in
        if (line.startsWith('m=video')) {
            inVideoSection = true;
            cLineSeenInVideo = false;
        } else if (line.startsWith('m=')) {
            // Leaving previous section — inject any missing nack / nack pli
            // for every video payload type before starting the next section.
            if (inVideoSection) {
                for (const pt of videoPayloadTypes) {
                    if (!seenNack.has(pt)) {
                        result.push(`a=rtcp-fb:${pt} nack`);
                    }
                    if (!seenNackPli.has(pt)) {
                        result.push(`a=rtcp-fb:${pt} nack pli`);
                    }
                }
                videoPayloadTypes.clear();
                seenNack.clear();
                seenNackPli.clear();
            }
            inVideoSection = false;
        }

        // Strip existing bandwidth lines in video section (we'll add fresh ones)
        if (inVideoSection && (line.startsWith('b=AS:') || line.startsWith('b=TIAS:'))) {
            continue;
        }

        result.push(line);

        // Track video payload types from rtpmap (exclude rtx retransmission)
        if (inVideoSection && line.startsWith('a=rtpmap:')) {
            const m = line.match(/^a=rtpmap:(\d+) (\S+)/);
            if (m && !m[2].startsWith('rtx')) {
                videoPayloadTypes.add(m[1]);
            }
        }

        // Track existing rtcp-fb lines for nack / nack pli
        if (inVideoSection && line.startsWith('a=rtcp-fb:')) {
            const m = line.match(/^a=rtcp-fb:(\d+) (.+)$/);
            if (m) {
                const pt = m[1];
                const type = m[2].trim();
                if (type === 'nack') seenNack.add(pt);
                if (type === 'nack pli') seenNackPli.add(pt);
            }
        }

        // Inject bandwidth modifiers right after the c= line in the video
        // section — tells GCC this much bandwidth is always available so
        // it doesn't over-back-off under packet loss.
        if (inVideoSection && line.startsWith('c=IN ') && !cLineSeenInVideo) {
            cLineSeenInVideo = true;
            result.push(`b=AS:${floorKbps}`);
            result.push(`b=TIAS:${floorBps}`);
        }

        // Inject x-google-* encoder hints into every video codec fmtp line.
        // start-bitrate at the floor so the encoder begins at a usable rate;
        // max-bitrate at config max so GCC can probe upward from the floor.
        if (inVideoSection && line.startsWith('a=fmtp:')) {
            const maxBitrate = config.video.maxBitrate * 1000000;
            const minBitrate = config.video.minBitrate * 1000000;
            result[result.length - 1] =
                line + `;x-google-start-bitrate=${floorBps};x-google-max-bitrate=${maxBitrate};x-google-min-bitrate=${minBitrate}`;
        }
    }

    return result.join('\r\n');
}

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
    socket.on("disconnect", () => {
        setTimeout(() => {
            location.reload()
        }, 5000)
    });
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
    self: IIdentity, config: IClientConfig, localStream: MediaStream, remoteStream: MediaStream
) {
    console.log(`[Video][0][${self.role}] Using config`, config, config)
    const pc = new RTCPeerConnection(config.rtc.peer);

    // Send Video
    localStream.getTracks().forEach((track) => {
        console.log(`[Video][1][${self.role}] Sending RTC Track Type ${track.kind}`)
        pc.addTrack(track, localStream);
    });

    // Receive Video
    pc.ontrack = (ev) => {
        console.log(`[Video][2][${self.role}] Receiving RTC Track`)
        remoteStream.addTrack(ev.track);
    }

    // Set Preferred video codec
    const videoTransceiver = pc.getTransceivers().find((s) => (s.sender.track ? s.sender.track.kind === 'video' : false))!;
    if (videoTransceiver) {
        // Tell the encoder to prioritize frame rate over single-frame quality
        // — essential for smooth video and avoiding freezes under congestion.
        if (videoTransceiver.sender.track) {
            videoTransceiver.sender.track.contentHint = 'motion';
        }

        const supportVideoCodec = RTCRtpSender.getCapabilities('video')!.codecs;
        const selectedVideoCodec = config.video.codecs.map((name) => supportVideoCodec.filter((codec) => codec.mimeType.includes(name))).flat();
        videoTransceiver.setCodecPreferences(selectedVideoCodec);
        // Prioritize smooth motion — drop resolution before dropping frames
        // to avoid video freezes under congestion.
        // 'maintain-framerate-and-resolution' is non-standard and can cause
        // the encoder to freeze when bandwidth is insufficient.
        videoTransceiver.degradationPreference = 'maintain-framerate';

        // Set Preferred bitrate
        const videoSender = videoTransceiver.sender;
        const videoParameters = videoSender.getParameters();
        videoParameters.encodings[0].maxBitrate = config.video.maxBitrate * 1000000;
        videoParameters.encodings[0].minBitrate = config.video.minBitrate * 1000000;
        // Temporal scalability: e.g. 'L1T3' splits video into 3 temporal
        // layers so the base layer still decodes when enhancement packets are
        // lost — no freeze, just a temporary framerate drop.  Works with
        // VP8, VP9, and AV1.  ~5 % encoding overhead.
        // Set to null / 'L1T1' to disable (single-layer).
        if (config.video.scalabilityMode) {
            (videoParameters.encodings[0] as any).scalabilityMode = config.video.scalabilityMode;
        }
        // Mark video as low priority — audio wins when the network is congested
        for (const encoding of videoParameters.encodings) {
            encoding.networkPriority = "low";
        }
        videoSender.setParameters(videoParameters);
    }
    const audioTransceiver = pc.getTransceivers().find((s) => (s.sender.track ? s.sender.track.kind === 'audio' : false))!;
    if (audioTransceiver) {
        // Set Preferred bitrate
        const audioSender = audioTransceiver.sender;
        const audioParameters = audioSender.getParameters();
        audioParameters.encodings[0].maxBitrate = config.audio.bitrate * 1000;
        // Mark audio as high priority so it survives network glitches
        for (const encoding of audioParameters.encodings) {
            encoding.networkPriority = "high";
        }
        audioSender.setParameters(audioParameters);
    }
    // Set Preferred Latency
    pc.getReceivers().forEach((receiver) => {
        receiver.jitterBufferTarget = config.video.buffer;
    })

    return pc;
}

async function initializeWebRTCStats(
    connection: RTCPeerConnection, config: IClientStatsConfig,
    reportConnection: (report: INetReport) => void
) {
    const toMbps = (bytes: number) => {
        if (bytes) {
            return (bytes / 1024 / 1024 * 8) / config.interval
        } else {
            return 0;
        }
    };
    const MbpsFormatter = (x: number) => {
        if (x < 10) {
            return x.toFixed(1);
        } else {
            return x.toFixed(0);
        }
    };
    const PercFormatter = (x: number) => {
        if (x < 10) {
            return x.toFixed(1);
        } else {
            return x.toFixed(0);
        }
    };


    await new Promise(r => window.setTimeout(r, config.delay * 1000));
    let curID = 0;
    let lastStats = await connection.getStats();
    const timer = window.setInterval(async () => {
        if (connection.iceConnectionState === "closed") {
            clearInterval(timer);
        } else {
            const curStats = await connection.getStats();

            let ans: INetReport = {
                id: curID,
                inMbps: 0,
                inLoss: 0,
                outMbps: 0,
                outLoss: 0,
                outMaxMbps: 0,
                summary: ""
            };

            for (const curDict of curStats.values()) {
                const lastDict = lastStats.get(curDict.id);
                if (curDict.type === "candidate-pair" && curDict.nominated && curDict.state === "succeeded") {
                    ans.outMaxMbps = Math.max(ans.outMaxMbps, (curDict.availableOutgoingBitrate || 0) / 1024 / 1024);
                } else if (curDict.type === "inbound-rtp" && curDict.kind == "video") {
                    ans.inMbps = toMbps(curDict?.bytesReceived - lastDict?.bytesReceived);
                    ans.inLoss = curDict?.packetsLost;
                } else if (curDict.type === "outbound-rtp" && curDict.kind == "video") {
                    ans.outMbps = toMbps(curDict?.bytesSent - lastDict?.bytesSent);
                } else if (curDict.type === "remote-inbound-rtp" && curDict.kind == "video") {
                    ans.outLoss = curDict?.packetsLost;
                }
            }

            ans.summary = [
                `[${PercFormatter(ans.inLoss)}%] ${MbpsFormatter(ans.inMbps)}▼`.padEnd(20, " "),
                `[${PercFormatter(ans.outLoss)}%] ${MbpsFormatter(ans.outMbps)}▲`.padEnd(20, " "),
                `${MbpsFormatter(ans.outMaxMbps)}►`
            ].join("");

            reportConnection(ans)
            curID += 1;
            lastStats = curStats;
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
        console.info(`[RTC][2.1][${self.role}]Connected to`, other);
        connection.onconnectionstatechange = null;
        if (updateProgress) updateProgress("Connected");
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

        console.info(`[RTC][0.0][Admin] Received Ready from ${room} `);

        config = adminConfig;
        console.info(`[RTC][0.1][Admin] Chosen config`, config);

        if (updateProgress) updateProgress("Creating Connection...");
        if (connection) connection.close();
        connection = await createConnection(config);
        connection.onicecandidate = cbInitialIceCandidate(connection, self, config);
        console.info(`[RTC][0.2][Admin] Prepared PeerConnection`, connection);
        if (updateProgress) updateProgress("Creating Offer...");
        const offer = await connection.createOffer();
        offer.sdp = modifySDP(offer.sdp!, config);
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
        connection.onicecandidate = cbInitialIceCandidate(connection, self, config);
        console.info(`[RTC][1.2][Client] Prepared PeerConnection`, connection);

        if (updateProgress) updateProgress("Setting Internal States...");

        await connection.setRemoteDescription(offer);
        const answer = await connection.createAnswer();
        answer.sdp = modifySDP(answer.sdp!, config);
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

export function replaceRTCTrack(track: MediaStreamTrack) {
    const sender = connection.getSenders().find(
        s => s.track?.kind === track.kind
    );
    sender!.replaceTrack(track);
}