import { Router } from "express";
import { pool } from "../db/pool.js";
import {
  register,
  login,
} from "../controllers/authController.js";
import {
  authenticateToken,
  AuthenticatedRequest,
} from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);

router.post("/login", login);

router.get(
  "/me",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          email,
          role,
          is_active,
          created_at
        FROM users
        WHERE id = $1
        `,
        [req.user!.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }

      return res.json({
        status: "ok",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Auth /me error:", error);

      return res.status(500).json({
        status: "error",
        message: "Failed to fetch user",
      });
    }
  }
);

export default router;