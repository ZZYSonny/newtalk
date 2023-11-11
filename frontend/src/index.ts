import { io, Socket } from "socket.io-client";

interface IClientConfig {
  iceServerURL: string

}
type IRole = "admin" | "client";

// Parse Parameter
const param = new URLSearchParams(window.location.search);
const room = param.get("room")!;
const role: IRole = param.get("role") as any;
const socket = io();
const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo: HTMLVideoElement = document.getElementById('remoteVideo') as HTMLVideoElement;

function createRoom() {
  console.log(`[${role}][Room] Join Room`);

  socket.once("full", () => {
    alert("Room is full. Please refresh.")
  })

  // The only place to use socket.on
  // Because the connection may needs to be restablished.
  socket.on("ready", () => {
    console.clear();
    console.log(`[${role}][Room] Ready`);
    createCall();
  });

  window.addEventListener("beforeunload", (ev) => socket.close());
  socket.emit("join", room);
}

function onceAsync(socket: Socket, name: string) {
  return new Promise<any>((resolve, _) => {
    socket.once(name, resolve);
  })
}

function sleepAsync(time) {
  return new Promise(resolve => setTimeout(resolve, time));
} 

async function openConnection(pc: RTCPeerConnection) {
  if (role == "client") {
    const localDesc = await pc.createOffer();
    await pc.setLocalDescription(localDesc);
    console.log(`[${role}][RTC][Desc][0] Created Offer`, localDesc);

    await socket.emitWithAck("webrtc desc", room, localDesc);

    const remoteDesc = await onceAsync(socket, "webrtc desc broadcast");
    console.log(`[${role}][RTC][Desc][3] Received Answer`, remoteDesc);
    pc.setRemoteDescription(remoteDesc);


  } else if (role == "admin") {
    await sleepAsync(2000);
    console.log("Sleep Done")
    const remoteDesc = await onceAsync(socket, "webrtc desc broadcast");

    console.log(`[${role}][RTC][Desc][1] Received Offer`, remoteDesc);
    pc.setRemoteDescription(remoteDesc);

    const localDesc = await pc.createAnswer();
    pc.setLocalDescription(localDesc);
    console.log(`[${role}][RTC][Desc][2] Created Answer`, localDesc);
    await socket.emitWithAck("webrtc desc", room, localDesc);
  }
  //pc.addEventListener("icecandidate", (ev) => {
  //  if (ev.candidate) {
  //    console.log(`[${role}][RTC][Candidate][0] Send Candidate `, ev.candidate);
  //    socket.emit("webrtc cand", room, ev.candidate);
  //  }
  //});
  //socket.on("webrtc cand broadcast", (cand: RTCIceCandidateInit) => {
  //  console.log(`[${role}][RTC][Candidate][1] Receive Candidate`, cand);
  //  pc.addIceCandidate(cand);
  //})
  //return pc;
}


async function createConnection(config: IClientConfig, type: "video") {
  const pc = new RTCPeerConnection({
    iceServers: [{
      "urls": config.iceServerURL
    }],
    iceTransportPolicy: config.iceServerURL.startsWith("turn") ? "relay" : "all"
  });

  if (type == "video") {
    const localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    console.log(`[${role}][Video][0] Get Local Stream`)
    // Set Local Video
    localVideo.srcObject = localStream;
    // Send Video
    localStream.getTracks().forEach((track) => {
      console.log(`[${role}][Video][1] Send RTC Track ${track.kind}`)
      pc.addTrack(track, localStream);
    });
    // Receive Video
    pc.ontrack = (ev) => {
      console.log(`[${role}][Video][2] Recv RTC Track ${ev.track.kind}`)
      if (ev.track.kind == "video") {
        remoteVideo.srcObject = ev.streams[0];
      }
    }
  }

  return pc;
}

async function createCall() {
  let config: IClientConfig = null;

  if (role === "admin") {
    const adminConfig: IClientConfig = {
      iceServerURL: "stun:stun.l.google.com:19302"
    }
    const clientConfig: IClientConfig = {
      iceServerURL: "stun:stun.l.google.com:19302"
    }
    console.log(`[${role}][Config][Call][0] Send Config to client`, clientConfig);
    await socket.emit("config call admin", room, clientConfig);
    config = adminConfig;
  } else if (role === "client") {
    const clientConfig = await onceAsync(socket, "config call client");
    console.log(`[${role}][Config][Call][1] Receive Config from admin`, clientConfig);
    config = clientConfig;
  }

  console.log(`[${role}][Config][Call][2] Using config`, config);
  const connection = await createConnection(config, "video");
  await openConnection(connection);
}






createRoom()
















let localStream: MediaStream | null = null;


