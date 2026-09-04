import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db/pool.js";
import parcelRoutes from "./routes/parcelRoutes.js";
import buildingRoutes from "./routes/buildingRoutes.js";
import propertyUnitRoutes from "./routes/propertyUnitRoutes.js";
import authRoutes from "./routes/authRoutes.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/parcels", parcelRoutes);
app.use("/api/buildings", buildingRoutes);
app.use("/api/property-units", propertyUnitRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "3D ULPIN API",
    version: "0.1.0",
  });
});

app.get("/api/db-test", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS user,
        PostGIS_Version() AS postgis_version
    `);

    res.json({
      status: "ok",
      database: result.rows[0],
    });
  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 3D ULPIN API running on http://localhost:${PORT}`);
});