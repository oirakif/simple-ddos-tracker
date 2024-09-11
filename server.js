const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const websocket = require('ws');

dotenv.config();
const app = express();
const wss = new websocket.Server({ port: process.env.WS_PORT });
const corsOptions = {
  origin: ["http://localhost:8080"],
};


app.use(cors(corsOptions));

// parse requests of content-type - application/json
app.use(bodyParser.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// database
const { db } = require("./app/models");

db.sequelize.sync();

// never enable the code below in production
// force: true will drop the table if it already exists
// db.sequelize.sync({ force: true }).then(() => {
//   console.log("Drop and Resync Database with { force: true }");
//   // initial();
// });

// simple route
app.get("/", (req, res) => {
  res.json({ message: "Hello" });
});

// http routes
require("./app/routes/httpRoutes")(app);

// ws routes
require("./app/routes/wsRoutes")(wss, websocket.OPEN);

// set port, listen for requests
const PORT = process.env.PORT || 7878;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});
