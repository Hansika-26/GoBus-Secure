require("dotenv").config();
require("./db/mongodb");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const app = express();
const { Server } = require("socket.io");
const http = require("http");
const router = require("./routes/_index.routes");
const errorHandler = require("./middlewares/errorHandler");
const Bus = require("./models/bus");

const server = http.createServer(app);

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

const chatSocket = require("./sockets/chatSocket");
chatSocket(io);

const busLocations = {};

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  // Send all current bus locations when a client connects
  socket.emit("initialLocations", busLocations);

  socket.on("setLocation", async (data) => {
    const { busId, latitude, longitude } = data;
    console.log("location", busId, latitude, longitude);

    try {
      await Bus.findByIdAndUpdate(
        { _id: busId },
        {
          start_trip: true,
          is_working: true,
        },
        { new: true }
      );
    } catch (error) {
      console.log(error);
    }

    // Store the updated location
    busLocations[busId] = { latitude, longitude };
    console.log(busLocations);

    io.emit("getLocation", { busId, latitude, longitude });
  });

  socket.on("getInitialLocation", (data) => {
    const { busId } = data;

    console.log("getInitialLocation request for busId:", busId);
    // Check if we have location data for this specific bus
    if (busLocations[busId]) {
      console.log(
        "Sending initial location for busId:",
        busId,
        busLocations[busId]
      );
      // Send the bus location only to the requesting client
      socket.emit("getLocation", {
        busId,
        latitude: busLocations[busId].latitude,
        longitude: busLocations[busId].longitude,
      });
    } else {
      console.log("No location data available for busId:", busId);
    }
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Vulnerability 2 fix: Content Security Policy header
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", ...allowedOrigins],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  })
);

// Vulnerability 3 fix: X-Frame-Options for legacy browser compatibility
// frameAncestors 'none' (above) covers modern browsers; this covers pre-CSP2 browsers
app.use(helmet.frameguard({ action: "deny" }));

app.use(bodyParser.json());
app.use("/auth", router);
app.use("/public", router);
app.use(errorHandler);
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
