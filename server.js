import { Server } from "socket.io";

const PORT = Number(process.env.WS_PORT) || 4000;

const io = new Server(PORT, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH"],
  },
});

let latestData = null;

io.on("connection", (socket) => {
  console.log(`[socket.io] Client connected (${io.engine.clientsCount} total)`);

  // Send current data to newly connected client
  if (latestData !== null) {
    socket.emit("sync", latestData);
  }

  socket.on("update", (data) => {
    latestData = data;
    // Broadcast to all OTHER connected clients
    socket.broadcast.emit("sync", latestData);
    console.log("[socket.io] Data updated and broadcast");
  });

  socket.on("disconnect", () => {
    console.log(
      `[socket.io] Client disconnected (${io.engine.clientsCount} total)`,
    );
  });

  socket.on("error", (err) => {
    console.error("[socket.io] Socket error:", err);
  });
});

console.log(`[socket.io] Server running on http://127.0.0.1:${PORT}`);
