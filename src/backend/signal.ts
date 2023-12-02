import * as socketIO from "socket.io";
import * as http from "http";
import * as esbuild from 'esbuild';

import { IIdentity } from "../common/interface"

export const io = new socketIO.Server();

io.sockets.on('connection', (socket) => {
  socket.on("room join", (id: IIdentity) => {
    const sockets = io.sockets.adapter.rooms.get(id.room);
    const num = sockets ? sockets.size : 0;

    console.log(`Name ${id.name} Role ${id.role} wants to join Room ${id.room} with ${num} users`)

    if (num < 2) {
      socket.join(id.room);
      if (num + 1 == 2) {
        io.sockets.in(id.room).emit("room ready broadcast", id.room);
      }
    } else {
      socket.emit("room full message", id.room);
    }
  });

  socket.on("webrtc offer", async (id: IIdentity, ...args) => {
    console.log(`Name ${id.name} Role ${id.role} sends initial offer to Room ${id.room}`)
    socket.to(id.room).emit("webrtc offer broadcast", id, ...args);
  })

  socket.on("webrtc answer", (id: IIdentity, ...args) => {
    console.log(`Name ${id.name} Role ${id.role} sends initial answer to Room ${id.room}`)
    socket.to(id.room).emit("webrtc answer broadcast", id, ...args);
  })

  socket.on("webrtc ice", (id: IIdentity, ...args) => {
    console.log(`Name ${id.name} Role ${id.role} sends initial ICE candidate to Room ${id.room}`)
    socket.to(id.room).emit("webrtc ice broadcast", id, ...args);
  })
})

export const esbuildReloadPlugin: esbuild.Plugin = {
  name: "reload",
  setup: (build) => {
    build.onEnd(result => {
      console.log("File changed. Refresh all clients")
      io.emit("refresh");
    })
  }
}