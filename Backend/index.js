require("dotenv").config();

require("./db/mongodb");

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
  })
);

app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)"
  );

  next();
});

const { Server } = require("socket.io");

const http = require("http");

const router = require("./routes/_index.routes");

const errorHandler = require("./middlewares/errorHandler");

const Bus = require("./models/bus");



const server = http.createServer(app);

const io = new Server(server, {

  cors: {

    origin: "*",

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



app.use(cors());

app.use(bodyParser.json());

app.use("/auth", router);

app.use("/public", router);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;



server.listen(PORT, () => {

  console.log(`Server is running on port ${PORT}`);

});