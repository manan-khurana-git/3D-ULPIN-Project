import { Router } from "express";
import { pool } from "../db/pool.js";
import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware.js";

const router = Router();

// GET all parcels
router.get(
  "/",
  authenticateToken,
  async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          id,
          ulpin,
          parcel_number,
          area_sq_m,
          base_elevation_m,
          ST_AsGeoJSON(geometry)::json AS geometry,
          created_at
        FROM parcels
        ORDER BY created_at DESC
      `);

      res.json({
        status: "ok",
        parcels: result.rows,
      });
    } catch (error) {
      console.error("Parcel fetch error:", error);

      res.status(500).json({
        status: "error",
        message: "Failed to fetch parcels",
      });
    }
  }
);

// GET parcel by ULPIN
router.get(
  "/:ulpin",
  authenticateToken,
  async (req, res) => {
    try {
      const ulpin = req.params.ulpin as string;
      
      if (!/^\d{14}$/.test(ulpin)) {
        return res.status(400).json({
          status: "error",
          message: "ULPIN must be exactly 14 digits",
        });
      }

      const result = await pool.query(
        `
        SELECT
          id,
          ulpin,
          parcel_number,
          area_sq_m,
          base_elevation_m,
          ST_AsGeoJSON(geometry)::json AS geometry,
          created_at
        FROM parcels
        WHERE ulpin = $1
        `,
        [ulpin]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Parcel not found",
        });
      }

      res.json({
        status: "ok",
        parcel: result.rows[0],
      });
    } catch (error) {
      console.error("Parcel fetch error:", error);

      res.status(500).json({
        status: "error",
        message: "Failed to fetch parcel",
      });
    }
  }
);

// CREATE parcel
router.post(
  "/",
  authenticateToken,
  requireRole(
    "ADMIN",
    "GOVERNMENT_OFFICER",
    "SURVEYOR"
  ),
  async (req, res) => {
    try {
      const {
        ulpin,
        parcel_number,
        area_sq_m,
        base_elevation_m,
        geometry,
      } = req.body;

      // Validate ULPIN
      if (!ulpin || !/^\d{14}$/.test(ulpin)) {
        return res.status(400).json({
          status: "error",
          message: "ULPIN must be exactly 14 digits",
        });
      }

      // Validate GeoJSON Polygon
      if (
        !geometry ||
        geometry.type !== "Polygon" ||
        !Array.isArray(geometry.coordinates)
      ) {
        return res.status(400).json({
          status: "error",
          message: "Geometry must be a valid GeoJSON Polygon",
        });
      }

      const elevation = Number(
        base_elevation_m ?? 0
      );

      if (!Number.isFinite(elevation)) {
        return res.status(400).json({
          status: "error",
          message:
            "base_elevation_m must be a valid number",
        });
      }

      const result = await pool.query(
        `
        INSERT INTO parcels (
          ulpin,
          parcel_number,
          area_sq_m,
          base_elevation_m,
          geometry
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          ST_SetSRID(
            ST_Translate(
              ST_Force3DZ(
                ST_GeomFromGeoJSON($5::jsonb)
              ),
              0,
              0,
              $4
            ),
            4326
          )
        )
        RETURNING
          id,
          ulpin,
          parcel_number,
          area_sq_m,
          base_elevation_m,
          ST_AsGeoJSON(geometry)::json AS geometry,
          created_at
        `,
        [
          ulpin,
          parcel_number ?? null,
          area_sq_m ?? null,
          elevation,
          JSON.stringify(geometry),
        ]
      );

      res.status(201).json({
        status: "ok",
        parcel: result.rows[0],
      });
    } catch (error: any) {
      console.error(
        "Parcel creation error:",
        error
      );

      if (error.code === "23505") {
        return res.status(409).json({
          status: "error",
          message:
            "A parcel with this ULPIN already exists",
        });
      }

      res.status(500).json({
        status: "error",
        message: "Failed to create parcel",
      });
    }
  }
);

export default router;