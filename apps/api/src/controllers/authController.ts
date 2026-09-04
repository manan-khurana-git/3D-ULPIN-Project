import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { authConfig } from "../config/auth.js";

type UserRole =
  | "ADMIN"
  | "GOVERNMENT_OFFICER"
  | "SURVEYOR"
  | "CITIZEN";

function createToken(user: {
  id: string;
  email: string;
  role: UserRole;
}) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    authConfig.jwtSecret,
    {
      expiresIn: authConfig.jwtExpiresIn,
    }
  );
}

export async function register(req: Request, res: Response) {
  try {
    const {
      name,
      email,
      password,
      role = "CITIZEN",
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Name, email and password are required",
      });
    }

    if (typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Name must contain at least 2 characters",
      });
    }

    if (typeof email !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Invalid email address",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email address",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "Password must contain at least 8 characters",
      });
    }

    const allowedRoles: UserRole[] = [
      "ADMIN",
      "GOVERNMENT_OFFICER",
      "SURVEYOR",
      "CITIZEN",
    ];

    if (!allowedRoles.includes(role as UserRole)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid user role",
      });
    }

    const existingUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      `,
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO users (
        name,
        email,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        email,
        role,
        is_active,
        created_at
      `,
      [
        name.trim(),
        normalizedEmail,
        passwordHash,
        role,
      ]
    );

    const user = result.rows[0];

    const token = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return res.status(201).json({
      status: "ok",
      message: "Account created successfully",
      token,
      user,
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to create account",
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        password_hash,
        role,
        is_active,
        created_at
      FROM users
      WHERE email = $1
      `,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        status: "error",
        message: "This account has been disabled",
      });
    }

    const passwordMatches = await bcrypt.compare(
      String(password),
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    const token = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return res.json({
      status: "ok",
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      status: "error",
      message: "Login failed",
    });
  }
}