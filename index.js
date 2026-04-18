import http from "http";
import express from "express";
import { createBareServer } from "@nebula-services/bare-server-node";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer();
const bareServer = createBareServer("/ca/");

const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Serve proxy interface
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "proxy.html"));
});

app.get("/proxy.html", (req, res) => {
  res.sendFile(path.join(__dirname, "proxy.html"));
});

// BARE server routing
server.on("request", (req, res) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  } else {
    socket.end();
  }
});

server.on("listening", () => {
  console.log(`🌍 Proxy server running at http://localhost:${PORT}`);
  console.log(`📖 Open http://localhost:${PORT} in your browser`);
});

server.listen(PORT);
