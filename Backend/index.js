require("dotenv").config();
require("./db/mongodb");

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const http = require("http");
const { Server } = require("socket.io");

const router = require("./routes/_index.routes");
const errorHandler = require("./middlewares/errorHandler");
const Bus = require("./models/bus");
const chatSocket = require("./sockets/chatSocket");

const app = express();

// Disable x-powered-by header
app.disable("x-powered-by");

// Parse cookies and request bodies early
app.use(cookieParser());
app.use(bodyParser.json());

// Allowed origins setup
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

// CORS configuration
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Security Headers (Helmet, CSP, Permissions-Policy)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ...allowedOrigins, "http://localhost:5000", "ws://localhost:5000"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    frameguard: { action: "deny" },
    noSniff: true,
  })
);

app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)"
  );
  next();
});

// HTTP & Socket.io Server Setup
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

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
    if (busLocations[busId]) {
      console.log(
        "Sending initial location for busId:",
        busId,
        busLocations[busId]
      );
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

// Routes & Middleware
app.use("/auth", router);
app.use("/public", router);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});