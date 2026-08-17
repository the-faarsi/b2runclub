"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = authenticateJWT;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "YourSuperSecretJWTString";
function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ error: "Invalid or expired token" });
            }
            req.user = decoded;
            next();
        });
    }
    else {
        // Unauthenticated request, let routes decide permissions based on "VISITOR" role fallback
        next();
    }
}
function requireRole(allowedRoles) {
    return (req, res, next) => {
        const userRole = req.user ? req.user.role : "VISITOR";
        if (allowedRoles.includes(userRole)) {
            next();
        }
        else {
            res.status(403).json({ error: "Forbidden: Access denied" });
        }
    };
}
