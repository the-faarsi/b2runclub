"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const crypto_1 = require("../utils/crypto");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "YourSuperSecretJWTString";
// Registration Endpoint
router.post("/register", async (req, res) => {
    try {
        const { email, password, name, role, emergency_contact } = req.body;
        if (!email || !password || !name) {
            res.status(400).json({ error: "Missing required fields: email, password, name" });
            return;
        }
        // Check if user already exists
        const existingUser = await prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ error: "A user with this email already exists" });
            return;
        }
        // Set role (default: MEMBER)
        const userRole = role || "MEMBER";
        if (!["ADMIN", "MEMBER", "VOLUNTEER", "VISITOR"].includes(userRole)) {
            res.status(400).json({ error: "Invalid role specified" });
            return;
        }
        const password_hash = (0, crypto_1.hashPassword)(password);
        const newUser = await prisma_1.default.user.create({
            data: {
                email,
                password_hash,
                name,
                role: userRole,
                emergency_contact: emergency_contact || null,
            },
        });
        res.status(211).json({
            message: "Registration successful",
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role,
                emergency_contact: newUser.emergency_contact,
                created_at: newUser.created_at,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Registration failed" });
    }
});
// Login Endpoint
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: "Missing email or password" });
            return;
        }
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user || !(0, crypto_1.verifyPassword)(password, user.password_hash)) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }
        // Generate JWT Token containing id, email, role
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Login failed" });
    }
});
exports.default = router;
