import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "YourSuperSecretJWTString";

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}

export function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
            if (err) {
                return res.status(401).json({ error: "Invalid or expired token" });
            }
            req.user = decoded as { id: string; email: string; role: string };
            next();
        });
    } else {
        // Unauthenticated request, let routes decide permissions based on "VISITOR" role fallback
        next();
    }
}

export function requireRole(allowedRoles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const userRole = req.user ? req.user.role : "VISITOR";
        if (allowedRoles.includes(userRole)) {
            next();
        } else {
            res.status(403).json({ error: "Forbidden: Access denied" });
        }
    };
}
