// __tests__/controllers.test.js
const { refactoreMe1, refactoreMe2, callmeWebSocket, getData, fetchAttackData } = require('../app/controllers/attacksController');
const { db, redisClient } = require('../app/models');

jest.mock('axios');
jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        on: jest.fn(),
        connect: jest.fn(),
        quit: jest.fn(), // Add any other methods that are used
    })),
}));

const axios = require('axios');
// Example test for refactoreMe1
describe('refactoreMe1 Tests', () => {
    let req, res, transaction;

    beforeEach(() => {
        // Mock request and response
        req = {
            body: {
                userId: 1,
                values: [1, 2, 3]
            }
        };

        res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };

        // Mock the transaction object
        transaction = {
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
        };

        // Mock db.sequelize.transaction to resolve with the mocked transaction object
        db.sequelize.transaction = jest.fn().mockResolvedValue(transaction);

        // Mock db.sequelize.query with different responses for each query call
        db.sequelize.query = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return empty array when no data is found', async () => {
        db.sequelize.query.mockResolvedValue([]);
        await refactoreMe1(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith({
            statusCode: 200,
            success: true,
            data: [],
        });
    });

    it('should return aggregated data', async () => {
        const data = [
            { values: [1, 2, 3] },
            { values: [1, 2, 3] }
        ]
        db.sequelize.query.mockResolvedValue(data);
        await refactoreMe1(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith({
            statusCode: 200,
            success: true,
            data: [0.2, 0.4, 0.6],
        });
    });

    it('should handle errors and return 500 status code', async () => {
        db.sequelize.query.mockRejectedValue(new Error('Database error'));

        await refactoreMe1(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith({
            statusCode: 500,
            success: false,
            message: 'Database error',
        });
    });
});


describe('refactoreMe2 Tests', () => {
    let req, res, transaction;

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock req and res
        req = {
            body: {
                userId: 1,
                values: [1, 2, 3]
            }
        };

        res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };

        // Mock the transaction object
        transaction = {
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
        };

        // Mock db.sequelize.transaction to resolve with the mocked transaction object
        db.sequelize.transaction = jest.fn().mockResolvedValue(transaction);

        // Mock db.sequelize.query to return different results
        db.sequelize.query = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks(); // Clear mocks between tests
    });

    it('should return 409 if the user has already completed the survey', async () => {
        // Mock the user check query to return a user with `dosurvey: true`
        db.sequelize.query
            .mockResolvedValueOnce([{ dosurvey: true }]) // First call: user check

        await refactoreMe2(req, res);

        // Expect response 409
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.send).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            message: "You have already submitted your survey.",
            success: false,
        }));

        // Ensure transaction commit and rollback were not called
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(transaction.rollback).not.toHaveBeenCalled();
    });


    it('should insert the survey and update user dosurvey flag', async () => {
        db.sequelize.query
            .mockResolvedValueOnce([{ dosurvey: false }]) // First call: user check
            .mockResolvedValueOnce([]) // Second call: no survey exists for user
            .mockResolvedValueOnce([{ id: 1 }]) // Third call: survey inserted
            .mockResolvedValueOnce([]); // Fourth call: user dosurvey flag updated
        await refactoreMe2(req, res);

        // Ensure the first query matches the user dosurvey check
        expect(db.sequelize.query).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining(`
      SELECT "dosurvey" 
      FROM users 
    `),
            expect.anything()  // Or you can pass specific options to match replacements, type, transaction
        );

        // Ensure the second query matches the survey check
        expect(db.sequelize.query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(`
      SELECT "userId" 
      FROM surveys 
    `),
            expect.anything()
        );

        // Ensure the third query matches the survey insertion
        expect(db.sequelize.query).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining(`INSERT INTO surveys`),
            expect.anything()
        );

        // // Ensure the fourth query matches the user update
        expect(db.sequelize.query).toHaveBeenNthCalledWith(
            4,
            expect.stringContaining(`UPDATE users`),
            expect.anything()
        );

        // Expect the transaction to be committed
        expect(transaction.commit).toHaveBeenCalled();

        // Expect response 201
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.send).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 201,
            message: "Survey sent successfully!",
            success: true,
        }));
    });

    it('should rollback the transaction on error', async () => {
        // Mock the user check query to throw an error
        db.sequelize.query.mockRejectedValue(new Error('Database error'));

        await refactoreMe2(req, res);

        // Expect error response
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 500,
            message: "Cannot post survey.",
            success: false,
        }));

        // Expect rollback to be called due to the error
        expect(transaction.rollback).toHaveBeenCalled();
    });
});

describe('callmeWebSocket Tests', () => {
    let ws;

    beforeEach(() => {
        ws = { send: jest.fn() };
        // Clear any previous mock calls
        db.sequelize.query = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks(); // Clear mocks between tests
    });

    it('should fetch attack data and emit it to WebSocket clients', async () => {
        const mockData = { data: [{ attack: 'mockAttack' }] };
        axios.get.mockResolvedValue(mockData); // Mock the resolved value
        // Mock storeAttackData
        const queryMock = jest.spyOn(db.sequelize, 'query').mockResolvedValue();

        await callmeWebSocket(ws, redisClient);
        expect(queryMock).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining(`INSERT INTO attacks`),
            expect.anything()
        );
        expect(ws.send).toHaveBeenCalledWith(JSON.stringify(mockData.data));
    });

    it('should handle errors and log error message', async () => {
        const error = new Error('API error');
        axios.get.mockRejectedValue(error); // Mock the rejected value

        // Mock console.error to test if it was called
        console.error = jest.fn();

        const result = await callmeWebSocket(ws, redisClient);

        expect(result).toBeNull();
        expect(console.error).toHaveBeenCalledWith('Error fetching data from the API:', error.message);
    });
});


describe('fetchAttackData Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.sequelize.query = jest.fn();
    });

    it('should fetch attack data and store it in the DB', async () => {
        const mockData = {
            data: [
                { sourceCountry: 'US', destinationCountry: 'CN', millisecond: 1234, type: 'DDoS', weight: 10, attackTime: '2024-09-11T00:00:00Z' },
            ],
        };

        axios.get.mockResolvedValue(mockData);

        const queryMock = jest.spyOn(db.sequelize, 'query');
        queryMock.mockResolvedValue();

        await fetchAttackData();

        expect(queryMock).toHaveBeenCalledWith(
            expect.stringContaining(`INSERT INTO attacks`),
            expect.anything()
        );
    });

    it('should handle API error', async () => {
        axios.get.mockRejectedValue(new Error('Network Error'));

        const result = await fetchAttackData();

        expect(axios.get).toHaveBeenCalledWith('https://livethreatmap.radware.com/api/map/attacks?limit=10');
        expect(result).toBeNull();
    });

    it('should handle DB error gracefully', async () => {
        const data = [{ sourceCountry: 'US', destinationCountry: 'CN', millisecond: 1234, type: 'DDoS', weight: 10, attackTime: '2024-09-11T00:00:00Z' }];
        axios.get.mockResolvedValue({ data });

        const queryMock = jest.spyOn(db.sequelize, 'query');
        queryMock.mockRejectedValue(new Error('DB Error'));

        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => { });

        const result = await fetchAttackData();

        expect(axios.get).toHaveBeenCalledWith('https://livethreatmap.radware.com/api/map/attacks?limit=10');
        expect(consoleErrorMock).toHaveBeenCalledWith('DB Error');
        expect(result).toBeNull();

        // Restore original implementation
        consoleErrorMock.mockRestore();
    });
});

describe('getData Tests', () => {
    let req;
    let res;

    beforeEach(() => {
        // Recreate the redisClient with redis-mock

        req = {};
        res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };
        jest.clearAllMocks();
    });

    it('should handle errors from the database gracefully', async () => {
        redisClient.get.mockImplementation((key, callback) => {
            callback(null, null); // No cached data
        });

        db.sequelize.query.mockRejectedValue(new Error('Database error'));

        await getData(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith({
            statusCode: 500,
            success: false,
            message: 'Database error',
        });
    });
});

// describe('getData Tests', () => {
//     let req;
//     let res;

//     beforeEach(() => {
//         req = {};
//         res = {
//             status: jest.fn().mockReturnThis(),
//             send: jest.fn(),
//         };
//         // Mock the redisClient.get method
//         redisClient.get = jest.fn((key, callback) => {
//             const cachedData = JSON.stringify({ label: ['USA'], total: [100] });
//             callback(null, cachedData);
//         });
//     });

//     it('should return cached data from Redis if available', async () => {
//         await getData(req, res);

//         // Check if redisClient.get was called
//         expect(redisClient.get).toHaveBeenCalledWith('attacksCache', expect.any(Function));
//         expect(res.status).toHaveBeenCalledWith(200);
//         expect(res.send).toHaveBeenCalledWith({
//             statusCode: 200,
//             success: true,
//             data: JSON.parse(JSON.stringify({ label: ['USA'], total: [100] })),
//         });
//     });

// it('should query the database and cache the result if no cached data is available', async () => {
//   const dbResult = [
//     { label: 'USA', total: 100 },
//     { label: 'Canada', total: 50 },
//   ];

//   redisClient.get.mockImplementation((key, callback) => {
//     callback(null, null); // No cached data
//   });

//   db.sequelize.query.mockResolvedValue(dbResult);

//   await getData(req, res);

//   expect(db.sequelize.query).toHaveBeenCalledWith(expect.any(String), { type: expect.anything() });
//   expect(redisClient.set).toHaveBeenCalledWith(
//     'attacksCache',
//     JSON.stringify({ label: ['USA', 'Canada'], total: [100, 50] }),
//     'EX',
//     180
//   );
//   expect(res.status).toHaveBeenCalledWith(200);
//   expect(res.send).toHaveBeenCalledWith({
//     statusCode: 200,
//     success: true,
//     data: { label: ['USA', 'Canada'], total: [100, 50] },
//   });
// });

// it('should handle errors from Redis and respond with an error message', async () => {
//   redisClient.get.mockImplementation((key, callback) => {
//     callback(new Error('Redis error'), null);
//   });

//   await getData(req, res);

//   expect(res.status).toHaveBeenCalledWith(500);
//   expect(res.send).toHaveBeenCalledWith({
//     statusCode: 500,
//     success: false,
//     message: 'Redis error',
//   });
// });


// });