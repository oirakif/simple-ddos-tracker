const { jwtMiddleware } = require("../middleware");
const attacksController = require("../controllers/attacksController");

module.exports = (app) => {
  app.use((req, res, next) => {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  const router = require("express").Router();

  router.get(
    "/",
    jwtMiddleware.verifyToken,
    jwtMiddleware.verifyRole(["user", "admin"]),
    attacksController.getData
  );

  app.use("/api/data", router);
};
