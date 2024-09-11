const jwt = require('jsonwebtoken');
const { jwtMiddleware } = require('../app/middleware/index'); // Assuming the file is named 'auth.js'

// Mock jwt.verify
jest.mock('jsonwebtoken', () => ({
    verify: jest.fn(),
}));

describe('verifyToken', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            header: jest.fn(),
        };
        res = {
            sendStatus: jest.fn(),
        };
        next = jest.fn();
    });

    it('should call next when token is valid', () => {
        const mockUser = { id: 1, role: 'admin' };
        req.header.mockReturnValue('Bearer valid_token');

        jwt.verify.mockImplementation((token, secret, callback) => {
            callback(null, mockUser); // Mocking valid token
        });

        jwtMiddleware.verifyToken(req, res, next);

        expect(jwt.verify).toHaveBeenCalledWith('valid_token', process.env.JWT_SECRET, expect.any(Function));
        expect(req.user).toEqual(mockUser); // Ensure user is attached to the request
        expect(next).toHaveBeenCalled(); // Proceed to the next middleware
    });

    it('should return 401 if no token is provided', () => {
        req.header.mockReturnValue(null);

        jwtMiddleware.verifyToken(req, res, next);

        expect(res.sendStatus).toHaveBeenCalledWith(401); // Unauthorized
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if token is invalid', () => {
        req.header.mockReturnValue('Bearer invalid_token');

        jwt.verify.mockImplementation((token, secret, callback) => {
            callback(new Error('Invalid token'), null); // Mocking invalid token
        });

        jwtMiddleware.verifyToken(req, res, next);

        expect(res.sendStatus).toHaveBeenCalledWith(403); // Forbidden
        expect(next).not.toHaveBeenCalled();
    });
});

describe('verifyRole', () => {
    let req, res, next;

    beforeEach(() => {
        req = { user: { role: 'admin' } }; // Mock user object
        res = { sendStatus: jest.fn() };
        next = jest.fn();
    });

    it('should call next if user has the correct role', () => {
        const middleware = jwtMiddleware.verifyRole(['admin']); // Only admin is allowed

        middleware(req, res, next);

        expect(next).toHaveBeenCalled(); // User has correct role, proceed
        expect(res.sendStatus).not.toHaveBeenCalled();
    });

    it('should return 403 if user does not have the correct role', () => {
        req.user.role = 'user'; // Mock as a normal user
        const middleware = jwtMiddleware.verifyRole(['admin']); // Only admin is allowed

        middleware(req, res, next);

        expect(res.sendStatus).toHaveBeenCalledWith(403); // Forbidden
        expect(next).not.toHaveBeenCalled();
    });
});
