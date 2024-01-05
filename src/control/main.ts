import { initializeSocket, socket } from "../common/webrtc";

const stateCaption = document.getElementById("stateCaption") as HTMLSpanElement;

(async()=>{
    stateCaption.textContent = "Connecting to Server...";
    await initializeSocket(null);
    stateCaption.textContent = "Sending reboot signal...";
    await socket.emitWithAck("control refresh")
    stateCaption.textContent = "Signal Sent...";
})()