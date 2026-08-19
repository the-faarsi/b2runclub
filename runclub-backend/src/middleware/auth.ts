import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../utils/secrets";

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

/**
 * Demands a real signed-in account, whatever its role.
 *
 * `requireRole` cannot express this. It maps an anonymous request to the role
 * "VISITOR", so a list that includes VISITOR — which it must, because VISITOR is a
 * genuine registered role — also lets signed-out traffic straight through. Any
 * handler then reading `req.user!.id` gets undefined and fails as a 500 instead of
 * an honest 401.
 *
 * Use this for anything scoped to "my own account".
 */
export function requireAccount(req: AuthRequest, res: Response, next: NextFunction) {
    if (!req.user?.id) {
        res.status(401).json({ error: "Sign in to continue" });
        return;
    }
    next();
}
