const config = require("../config/db");
const redis = require('redis');
const joi = require("joi");
const Sequelize = require("sequelize");
const sequelize = new Sequelize(config.DB, config.USER, config.PASSWORD, {
  host: config.HOST,
  dialect: config.dialect,
  operatorsAliases: 0,

  pool: {
    max: config.pool.max,
    min: config.pool.min,
    acquire: config.pool.acquire,
    idle: config.pool.idle,
  },
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// define model example
// db.user = require("../models/User")(sequelize, Sequelize);

// relation example
// relation between role and user
// db.role.hasMany(db.user, {
//   as: "users",
//   onDelete: "cascade",
//   onUpdate: "cascade",
// });

// db.user.belongsTo(db.role, {
//   foreignKey: "roleId",
//   as: "role",
// });

const redisClient = redis.createClient();
redisClient.on('error', (err) => console.error('Redis error:', err));
redisClient.connect()

const refactoreMe2RequestSchema = joi.object({
  userId: joi.number()
    .min(0)
    .required(),

  values: joi.array().items(
    joi.number()
      .min(0)
      .required()
  )
    .min(0)
    .required(),
})

module.exports = { db, redisClient, refactoreMe2RequestSchema };
