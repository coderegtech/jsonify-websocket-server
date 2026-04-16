import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";

// Load environment variables from .env file
dotenv.config();

// Configuration
const PORT = Number(process.env.PORT) || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// Parse CORS origins (comma-separated for multiple origins)
const corsOrigins =
  CORS_ORIGIN === "*" ? "*" : CORS_ORIGIN.split(",").map((o) => o.trim());

// Express app setup
const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable for WebSocket compatibility
  }),
);
app.use(compression());
app.use(
  cors({
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  }),
);
app.use(express.json());

// Disable x-powered-by header
app.disable("x-powered-by");

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    name: "jsonify-websocket-server",
    version: "1.0.0",
    status: "running",
  });
});

// Socket.IO setup with production configuration
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Production optimizations
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
  allowEIO3: true, // Compatibility with older clients
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

  socket.on("disconnect", (reason) => {
    console.log(
      `[socket.io] Client disconnected: ${reason} (${io.engine.clientsCount} total)`,
    );
  });

  socket.on("error", (err) => {
    console.error("[socket.io] Socket error:", err);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[express] Error:", err.message);
  res.status(500).json({
    error: NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n[server] ${signal} received. Shutting down gracefully...`);

  io.close(() => {
    console.log("[socket.io] All connections closed");
  });

  httpServer.close(() => {
    console.log("[server] HTTP server closed");
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error(
      "[server] Could not close connections in time, forcefully shutting down",
    );
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[server] Unhandled Rejection at:", promise, "reason:", reason);
});

// Start server
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Environment: ${NODE_ENV}`);
  console.log(`[server] WebSocket server running on http://0.0.0.0:${PORT}`);
  console.log(`[server] Health check: http://0.0.0.0:${PORT}/health`);
});
