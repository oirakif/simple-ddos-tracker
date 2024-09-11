const { db, redisClient, refactoreMe2RequestSchema } = require("../models");
const axios = require('axios');
// const Model = db.Model;
const { QueryTypes } = require("sequelize");

exports.refactoreMe1 = async (req, res) => {
  try {
    const data = await db.sequelize.query(`SELECT "values" FROM surveys`, {
      type: QueryTypes.SELECT,
    });

    if (data.length === 0) {
      res.status(200).send({
        statusCode: 200,
        success: true,
        data: [],
      });
    }
    let indices = []; // Initialize as an empty array

    data.forEach((e) => {
      e.values.forEach((value, i) => {
        if (!indices[i]) indices[i] = []; // Dynamically create subarrays if they don't exist
        indices[i].push(value); // Push the current value to the appropriate subarray
      });
    });

    const totalIndices = indices.map(
      (index) => index.reduce((a, b) => a + b, 0) / 10
    );

    res.status(200).send({
      statusCode: 200,
      success: true,
      data: totalIndices,
    });
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      success: false,
      message: error.message,
    });
  }
};

exports.refactoreMe2 = async (req, res) => {
  // validate payload
  const validatePayload = refactoreMe2RequestSchema.validate(req.body)
  if (validatePayload.hasOwnProperty('error')) {
    return res.status(400).send({
      statusCode: 400,
      message: validatePayload.error.message,
      success: false,
    });
  }

  const { userId, values } = req.body;
  const tx = await db.sequelize.transaction();

  try {
    // Check if the user has already completed the survey
    const userCheckQuery = `
      SELECT "dosurvey" 
      FROM users 
      WHERE "id" = :userId;
    `;

    const userResult = await db.sequelize.query(
      userCheckQuery,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
        transaction: tx
      },
    );

    if (userResult.length === 0) {
      return res.status(404).send({
        statusCode: 404,
        message: "user not found",
        success: false,
      });
    }

    if (userResult[0].dosurvey) {
      // User has already done the survey, no need to insert
      return res.status(409).send({
        statusCode: 409,
        message: "You have already submitted your survey.",
        success: false,
      });
    }

    const surveyCheckQuery = `
      SELECT "userId" 
      FROM surveys 
      WHERE "userId" = :userId;
    `;

    const surveyResult = await db.sequelize.query(
      surveyCheckQuery,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
        transaction: tx
      }
    );

    if (surveyResult.length > 0) {
      // failover dosurvey flag checker
      if (!userResult.dosurvey) {
        const userUpdateQuery = `
          UPDATE users 
          SET "dosurvey" = true, "updatedAt" = NOW() 
          WHERE "id" = :userId;
        `;
        await db.sequelize.query(userUpdateQuery, {
          replacements: { userId },
          type: QueryTypes.UPDATE,
          transaction: tx
        },
        );
      }
      tx.commit()
      return res.status(409).send({
        statusCode: 409,
        message: "You have already submitted your survey.",
        success: false,
      });
    }

    // Convert the values array to a PostgreSQL-compatible array format
    const valuesJSON = `{${values.join(',')}}`;
    const insertSurveyQuery = `
      INSERT INTO surveys ("userId", "values", "createdAt", "updatedAt")
      VALUES (:userId, :valuesJSON::int[], NOW(), NOW())
      RETURNING *;
    `;

    const [data] = await db.sequelize.query(
      insertSurveyQuery,
      {
        replacements: { userId, valuesJSON },
        type: QueryTypes.INSERT,
        transaction: tx
      },
    );

    // Update the user's 'dosurvey' field
    const userUpdateQuery = `
      UPDATE users 
      SET "dosurvey" = true, "updatedAt" = NOW() 
      WHERE id = :userId;
    `;

    await db.sequelize.query(
      userUpdateQuery,
      {
        replacements: { userId },
        type: QueryTypes.UPDATE,
        transaction: tx
      });
    tx.commit();

    res.status(201).send({
      statusCode: 201,
      message: "Survey sent successfully!",
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      statusCode: 500,
      message: "Cannot post survey.",
      success: false,
    });
    tx.rollback();
    return;
  }
};

exports.callmeWebSocket = async (ws, redisClient) => {
  try {
    const { data } = await axios.get('https://livethreatmap.radware.com/api/map/attacks?limit=10');

    // emit the data to ws clients
    ws.send(JSON.stringify(data));

    // store the API result to DB
    storeAttackData(data.flat());
  } catch (error) {
    console.error('Error fetching data from the API:', error.message);
    return null;
  }
};

exports.getData = async (req, res) => {
  const cachedAttack = await redisClient.get("attacksCache", (err, reply) => {
    if (err) {
      console.error('Error fetching key:', err);
    }
  })

  if (cachedAttack != undefined) {
    res.status(200).send({
      statusCode: 200,
      success: true,
      data: JSON.parse(cachedAttack),
    });
    return
  }
  try {
    const attacks = await db.sequelize.query(`
      SELECT
        "sourceCountry" AS label,
        COUNT("destinationCountry") AS total
      FROM
        attacks
      WHERE
        "destinationCountry" != ''  -- Exclude empty destinationCountry
      GROUP BY
        "sourceCountry"
      ORDER BY
        "sourceCountry";
  `, {
      type: QueryTypes.SELECT,
    });

    if (attacks.length === 0) {
      res.status(200).send({
        statusCode: 200,
        success: true,
        data: { label: [], total: [] },
      });
      return
    }

    const label = [];
    const total = [];

    // Populate arrays using a single loop
    attacks.forEach(attack => {
      label.push(attack.label);
      total.push(attack.total);
    });

    const data = { label, total }
    // save the result to redis
    redisClient.set('attacksCache', JSON.stringify(data), 'EX', 180);

    res.status(200).send({
      statusCode: 200,
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      success: false,
      message: error.message,
    });
  }
};

exports.fetchAttackData = async () => {
  try {
    const { data } = await axios.get('https://livethreatmap.radware.com/api/map/attacks?limit=10');
    // store the API result to DB
    await storeAttackData(data.flat());
    return data;
  } catch (error) {
    console.error('Error fetching data from the API:', error.message);
    return null;
  }
};

async function storeAttackData(attacks) {
  try {
    const values = [];
    const placeholders = [];
    attacks.forEach(attack => {
      placeholders.push(`(?, ?, ?, ?, ?, ?, NOW(), NOW())`);
      values.push(attack.sourceCountry, attack.destinationCountry, attack.millisecond, attack.type, attack.weight, attack.attackTime);
    });
    const query = `
      INSERT INTO attacks ("sourceCountry", "destinationCountry", "millisecond", "type", "weight", "attackTime", "createdAt", "updatedAt")
      VALUES ${placeholders}
    `;

    await db.sequelize.query(query, { replacements: values });
  } catch (err) {
    console.error(err.message);
    throw err; // Rethrow the error to ensure it propagates to the calling function
  }
}