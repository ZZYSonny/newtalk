import { IIdentity, initializeWebRTCAdmin, initializeWebRTCClient } from "./webrtc.ts";

export interface IClientConfig {
  iceServerURL: string
}

// Parse Parameter
const param = new URLSearchParams(window.location.search);
const id: IIdentity = {
  name: param.get("name")!,
  room: param.get("room")!,
  role: param.get("role")!,
  
}
const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;

async function createConnection(config: IClientConfig) {
  const pc = new RTCPeerConnection({
    iceServers: [{ "urls": config.iceServerURL }],
    iceTransportPolicy: config.iceServerURL.startsWith("turn") ? "relay" : "all"
  });

  console.log(`[Video][0][${id.role}] Get Local Stream`)
  const localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  // Set Local Video
  localVideo.srcObject = localStream;

  // Send Video
  localStream.getTracks().forEach((track) => {
    console.log(`[Video][1][${id.role}] Sending RTC Track ${track.kind}`)
    pc.addTrack(track, localStream);
  });

  // Receive Video
  pc.ontrack = (ev) => {
    console.log(`[Video][2][${id.role}] Receiving RTC Track ${ev.track.kind}`)
    if (ev.track.kind == "video") {
      remoteVideo.srcObject = ev.streams[0];
    }
  }

  return pc;
}


async function initCall() {
  if (id.role === "admin") {
    const adminConfig: IClientConfig = {
      iceServerURL: "stun:stun.l.google.com:19302"
    }
    const clientConfig: IClientConfig = {
      iceServerURL: "stun:stun.l.google.com:19302"
    }
    await initializeWebRTCAdmin(createConnection, id, adminConfig, clientConfig);
  } else if (id.role === "client") {
    await initializeWebRTCClient(createConnection, id);
  }
}

initCall()















let localStream: MediaStream | null = null;


