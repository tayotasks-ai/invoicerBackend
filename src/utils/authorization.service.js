const jwt = require('jsonwebtoken');
require('dotenv').config();

if (!process.env.JWT_SECRET) {
    // Falling back silently means anyone can forge a valid token by using the
    // same well-known default - only acceptable for local development.
    console.warn(
        'WARNING: JWT_SECRET is not set. Using an insecure default secret - ' +
        'set JWT_SECRET in your environment before deploying this anywhere real.'
    );
}
const secret = process.env.JWT_SECRET || 'default-secret-key'; // Fallback secret (dev only, see warning above)
const expiresIn = process.env.JWT_EXPIRES_IN || '24h';

// Authorization class for generating and verifying JWTs
class Authorization {
    constructor() {
        // Load JWT secret and expiration from environment variables
        // Fallback to 1 hour
    }

    // Generate a JWT for a user
    static generateToken(payload) {
        try {
            // Sign the token with the payload, secret, and expiration
            const token = jwt.sign(payload, secret, { expiresIn: expiresIn });
            return {
                success: true,
                token: `${token}`, // Include "Bearer" prefix (common convention)
                expiresIn
            };
        } catch (error) {
            console.error('Error generating JWT:', error.message);
            return {
                success: false,
                error: 'Failed to generate token'
            };
        }
    }

    // Verify a JWT and return the decoded payload
    static verifyToken(token) {
        try {
            // Remove "Bearer " prefix if present
            const tokenToVerify = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

            // Verify the token
            const decoded = jwt.verify(tokenToVerify, secret);
            return {
                success: true,
                decoded
            };
        } catch (error) {
            console.error('Error verifying JWT:', error.message);
            let errorMessage = 'Invalid token';
            if (error.name === 'TokenExpiredError') {
                errorMessage = 'Token has expired';
            } else if (error.name === 'JsonWebTokenError') {
                errorMessage = 'Token is malformed';
            }
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    // Middleware to protect routes (for use in Express.js)
    static async authenticateToken(req, res, next) {
        // Get the token from the Authorization header
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Verify the token
        const result = Authorization.verifyToken(authHeader);
        if (!result.success) {
            return res.status(401).json({ error: result.error });
        }

        // Attach the decoded payload to the request object
        req.user = result.decoded;

        // Workspace switching, for an accountant/bookkeeper with access to
        // one or more client businesses (see accountant.service.js and the
        // AccountantAccess model). If the frontend sends `x-business-id`
        // and it differs from the caller's own id, this request is "acting
        // as" that business - but only once an active AccountantAccess
        // grant confirms that's actually allowed.
        //
        // Every controller/service in this codebase reads the acting
        // entity from `req.user.id` alone (invoice/customer/inventory/
        // entity settings, etc) - overwriting it here, in the one place
        // every authenticated request already passes through, makes all of
        // that workspace-aware for free instead of threading an
        // "actingEntityId" through dozens of call sites. When the header
        // is absent (the overwhelming common case - a business acting as
        // itself), nothing here runs and behavior is unchanged.
        const businessId = req.headers['x-business-id'];
        if (businessId && String(businessId) !== String(req.user.id)) {
            try {
                // Required inline (not at module load) to avoid a circular
                // require - services/index.js pulls in a lot of the app,
                // and this file is loaded very early by nearly every route.
                const { AccountantService } = require('../services/accountant.service');
                const allowed = await AccountantService.hasActiveAccess(req.user.id, businessId);
                if (!allowed) {
                    return res.status(403).json({ error: "You don't have access to this business" });
                }
                // The real logged-in identity, kept in case a route ever
                // needs to know who's actually acting (e.g. an audit trail)
                // - nothing reads this yet, but it's free to preserve.
                req.actingAccountant = { id: req.user.id, email: req.user.email };
                req.user = { ...req.user, id: businessId };
            } catch (error) {
                console.error('authenticateToken: workspace switch check failed:', error.message);
                return res.status(500).json({ error: 'Could not verify workspace access' });
            }
        }

        next();
    }
}

module.exports = Authorization;