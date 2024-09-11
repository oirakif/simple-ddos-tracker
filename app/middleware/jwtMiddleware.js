const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403); // Forbidden
      }
      req.user = user; // Attach user information to the request
      next();
    });
  } else {
    return res.sendStatus(401); // Unauthorized
  }
};

const verifyRole = (allowedRoles) => (req, res, next) => {
  const userRole = req.user.role;
  if (allowedRoles.includes(userRole)) {
    next(); // User has the right role, proceed to the controller
  } else {
    return res.sendStatus(403); // Forbidden
  }
};

module.exports = {
  verifyToken,
  verifyRole,
};;
