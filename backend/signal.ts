import * as socketIO from "socket.io";
import * as http from "http";

interface IIdentity {
  name: string,
  room: string,
  role: string
}

export function createSocketBackend(httpServer: http.Server) {
  const io = new socketIO.Server().listen(httpServer);
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

    socket.on("webrtc initial offer", async (id: IIdentity, ...args) => {
      console.log(`Name ${id.name} Role ${id.role} sends initial offer to Room ${id.room}`)
      socket.to(id.room).emit("webrtc initial offer broadcast", id, ...args);
    })

    socket.on("webrtc initial answer", (id: IIdentity, ...args) => {
      console.log(`Name ${id.name} Role ${id.role} sends initial answer to Room ${id.room}`)
      socket.to(id.room).emit("webrtc initial answer broadcast", id, ...args);
    })

    socket.on("webrtc initial ice", (id: IIdentity, ...args) => {
      console.log(`Name ${id.name} Role ${id.role} sends initial ICE candidate to Room ${id.room}`)
      socket.to(id.room).emit("webrtc initial ice broadcast", id, ...args);
    })

    socket.on("webrtc renegotiate offer", async (id: IIdentity, ...args) => {
      console.log(`Name ${id.name} Role ${id.role} sends renegotiate offer to Room ${id.room}`)
      socket.to(id.room).emit("webrtc renegotiate offer broadcast", id, ...args);
    })

    socket.on("webrtc renegotiate answer", (id: IIdentity, ...args) => {
      console.log(`Name ${id.name} Role ${id.role} sends renegotiate answer to Room ${id.room}`)
      socket.to(id.room).emit("webrtc renegotiate answer broadcast", id, ...args);
    })

    socket.on("webrtc renegotiate ice", (id: IIdentity, ...args) => {
      console.log(`Name ${id.name} Role ${id.role} sends renegotiate ICE candidate to Room ${id.room}`)
      socket.to(id.room).emit("webrtc renegotiate ice broadcast", id, ...args);
    })
  })
}