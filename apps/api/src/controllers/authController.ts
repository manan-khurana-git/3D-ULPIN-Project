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

/*
|--------------------------------------------------------------------------
| REGISTER
| POST /api/auth/register
|--------------------------------------------------------------------------
*/

export async function register(
  req: Request,
  res: Response
) {
  try {
    const {
      name,
      email,
      password,
      role = "CITIZEN",
      government_id,
      verification_code,
    } = req.body;

    /*
     * ---------------------------------------------------------------
     * BASIC VALIDATION
     * ---------------------------------------------------------------
     */

    if (!name || !email || !password) {
      return res.status(400).json({
        status: "error",
        message:
          "Name, email and password are required",
      });
    }

    if (
      typeof name !== "string" ||
      name.trim().length < 2
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Name must contain at least 2 characters",
      });
    }

    if (typeof email !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Invalid email address",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email address",
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Password must contain at least 8 characters",
      });
    }

    /*
     * ---------------------------------------------------------------
     * NORMALIZE ROLE
     * ---------------------------------------------------------------
     */

    const normalizedRole =
      typeof role === "string"
        ? role.trim().toUpperCase()
        : "CITIZEN";

    /*
     * ---------------------------------------------------------------
     * PUBLIC REGISTRATION ROLES
     *
     * ADMIN IS NEVER ALLOWED THROUGH PUBLIC REGISTRATION.
     * ---------------------------------------------------------------
     */

    const publicRoles: UserRole[] = [
      "CITIZEN",
      "SURVEYOR",
      "GOVERNMENT_OFFICER",
    ];

    if (
      !publicRoles.includes(
        normalizedRole as UserRole
      )
    ) {
      return res.status(403).json({
        status: "error",
        message:
          "This role cannot be registered through public registration",
      });
    }

    /*
     * ---------------------------------------------------------------
     * GOVERNMENT OFFICER VERIFICATION
     *
     * A user requesting GOVERNMENT_OFFICER must provide:
     *
     * 1. Government ID
     * 2. Verification code
     *
     * Both are checked against the government officer registry.
     * ---------------------------------------------------------------
     */

    if (
      normalizedRole ===
      "GOVERNMENT_OFFICER"
    ) {
      if (
        typeof government_id !== "string" ||
        !government_id.trim()
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Government ID is required for Government Officer registration",
        });
      }

      if (
        typeof verification_code !==
          "string" ||
        !verification_code.trim()
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Government verification code is required",
        });
      }

      const normalizedGovernmentId =
        government_id.trim();

      const normalizedVerificationCode =
        verification_code.trim();

      /*
       * -------------------------------------------------------------
       * VERIFY GOVERNMENT CREDENTIALS
       * -------------------------------------------------------------
       */

      const governmentOfficerResult =
        await pool.query(
          `
          SELECT
            id,
            government_id,
            officer_name,
            department,
            designation,
            is_active

          FROM government_officer_registry

          WHERE government_id = $1
            AND verification_code = $2
            AND is_active = TRUE

          LIMIT 1
          `,
          [
            normalizedGovernmentId,
            normalizedVerificationCode,
          ]
        );

      /*
       * -------------------------------------------------------------
       * INVALID GOVERNMENT CREDENTIALS
       * -------------------------------------------------------------
       */

      if (
        governmentOfficerResult
          .rows.length === 0
      ) {
        return res.status(403).json({
          status: "error",
          message:
            "Government ID or verification code is invalid",
        });
      }

      const governmentOfficer =
        governmentOfficerResult.rows[0];

      /*
       * -------------------------------------------------------------
       * OPTIONAL NAME VERIFICATION
       *
       * The registered officer name must match the
       * government registry name.
       * -------------------------------------------------------------
       */

      if (
        governmentOfficer.officer_name
          .trim()
          .toLowerCase() !==
        name.trim().toLowerCase()
      ) {
        return res.status(403).json({
          status: "error",
          message:
            "The name does not match the government officer record",
        });
      }
    }

    /*
     * ---------------------------------------------------------------
     * CHECK EXISTING USER
     * ---------------------------------------------------------------
     */

    const existingUser =
      await pool.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
        `,
        [normalizedEmail]
      );

    if (
      existingUser.rows.length > 0
    ) {
      return res.status(409).json({
        status: "error",
        message:
          "An account with this email already exists",
      });
    }

    /*
     * ---------------------------------------------------------------
     * HASH PASSWORD
     * ---------------------------------------------------------------
     */

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    /*
     * ---------------------------------------------------------------
     * CREATE USER
     *
     * IMPORTANT:
     * The role inserted into the database comes from the
     * server-side validated normalizedRole.
     * ---------------------------------------------------------------
     */

    const result =
      await pool.query(
        `
        INSERT INTO users (
          name,
          email,
          password_hash,
          role
        )

        VALUES (
          $1,
          $2,
          $3,
          $4
        )

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
          normalizedRole,
        ]
      );

    const user =
      result.rows[0];

    /*
     * ---------------------------------------------------------------
     * CREATE JWT
     * ---------------------------------------------------------------
     */

    const token =
      createToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

    /*
     * ---------------------------------------------------------------
     * SUCCESS RESPONSE
     * ---------------------------------------------------------------
     */

    return res.status(201).json({
      status: "ok",

      message:
        "Account created successfully",

      token,

      user,
    });
  } catch (error) {
    console.error(
      "Registration error:",
      error
    );

    return res.status(500).json({
      status: "error",
      message:
        "Failed to create account",
    });
  }
}

/*
|--------------------------------------------------------------------------
| LOGIN
| POST /api/auth/login
|--------------------------------------------------------------------------
*/

export async function login(
  req: Request,
  res: Response
) {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message:
          "Email and password are required",
      });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    /*
     * ---------------------------------------------------------------
     * FIND USER
     * ---------------------------------------------------------------
     */

    const result =
      await pool.query(
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

    if (
      result.rows.length === 0
    ) {
      return res.status(401).json({
        status: "error",
        message:
          "Invalid email or password",
      });
    }

    const user =
      result.rows[0];

    /*
     * ---------------------------------------------------------------
     * CHECK ACCOUNT STATUS
     * ---------------------------------------------------------------
     */

    if (!user.is_active) {
      return res.status(403).json({
        status: "error",
        message:
          "This account has been disabled",
      });
    }

    /*
     * ---------------------------------------------------------------
     * CHECK PASSWORD
     * ---------------------------------------------------------------
     */

    const passwordMatches =
      await bcrypt.compare(
        String(password),
        user.password_hash
      );

    if (!passwordMatches) {
      return res.status(401).json({
        status: "error",
        message:
          "Invalid email or password",
      });
    }

    /*
     * ---------------------------------------------------------------
     * CREATE JWT
     * ---------------------------------------------------------------
     */

    const token =
      createToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

    /*
     * ---------------------------------------------------------------
     * SUCCESS
     * ---------------------------------------------------------------
     */

    return res.json({
      status: "ok",

      message:
        "Login successful",

      token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active:
          user.is_active,
        created_at:
          user.created_at,
      },
    });
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      status: "error",
      message:
        "Login failed",
    });
  }
}