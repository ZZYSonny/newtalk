'use strict';
import * as http from "http";
import * as socketIO from "socket.io";

const httpServer = http.createServer((req, res) => {
  // Create an HTTP request to port 8000 and forward all incoming data  
  const proxyReq = http.request({
    host: 'localhost',
    port: 8000,
    path: req.url,
    method: req.method,
    headers: req.headers
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode!, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  req.pipe(proxyReq, { end: true });

  proxyReq.on('error', (error) => {
    console.error('Error forwarding the request:', error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  });
});
httpServer.listen(8080);


















const io = new socketIO.Server().listen(httpServer);
io.sockets.on('connection', (socket) => {
  socket.on("join", (room: string) => {
    const sockets = io.sockets.adapter.rooms.get(room);
    const num = sockets ? sockets.size : 0;
    if (num < 2) {
      socket.join(room);
      if (num + 1 == 2) {
        io.sockets.in(room).emit("ready");
      }
    } else {
      socket.emitWithAck("full");
    }
  });

  socket.on("config call admin", (room: string, config) => {
    socket.to(room).emit("config call client", config);
  });

  socket.on("webrtc desc", async (room: string, desc) => {
    socket.to(room).emit("webrtc desc broadcast", desc);
  })

  socket.on("webrtc cand", (room: string, cand) => {
    socket.to(room).emitWithAck("webrtc cand broadcast", cand);
  })
})