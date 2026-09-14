import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db/pool.js";
import parcelRoutes from "./routes/parcelRoutes.js";
import buildingRoutes from "./routes/buildingRoutes.js";
import propertyUnitRoutes from "./routes/propertyUnitRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import propertyRegistrationRoutes from "./routes/propertyRegistrationRoutes.js";
import propertyTransferRequestRoutes from "./routes/propertyTransferRequestRoutes.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/parcels", parcelRoutes);
app.use("/api/buildings", buildingRoutes);
app.use("/api/property-units", propertyUnitRoutes);
app.use("/api/property-registrations",propertyRegistrationRoutes);
app.use("/api/property-transfer-requests",propertyTransferRequestRoutes);

/*
 * OpenStreetMap tile proxy
 *
 * Browser:
 *   http://localhost:5000/api/map/tiles/{z}/{x}/{y}.png
 *
 * Server:
 *   https://tile.openstreetmap.org/{z}/{x}/{y}.png
 *
 * This keeps the tile request same-origin from the browser's
 * point of view and forwards the required application identity
 * and Referer to OpenStreetMap.
 */
app.get(
  "/api/map/tiles/:z/:x/:y.png",
  async (req, res) => {
    try {
      const z = Number(req.params.z);
      const x = Number(req.params.x);
      const y = Number(req.params.y);

      if (
        !Number.isInteger(z) ||
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        z < 0 ||
        z > 22 ||
        x < 0 ||
        y < 0
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid map tile coordinates",
        });
      }

      const maxTileIndex =
        Math.pow(2, z) - 1;

      if (
        x > maxTileIndex ||
        y > maxTileIndex
      ) {
        return res.status(400).json({
          status: "error",
          message: "Map tile coordinates are out of range",
        });
      }

      const tileUrl =
        `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

      const upstreamResponse =
        await fetch(tileUrl, {
          headers: {
            "User-Agent":
              "3D-ULPIN/0.1.0 (+http://localhost:5173)",
            Referer:
              req.get("referer") ||
              "http://localhost:5173/",
          },
        });

      if (!upstreamResponse.ok) {
        console.error(
          `OSM tile request failed: ${upstreamResponse.status} ${tileUrl}`
        );

        return res.status(
          upstreamResponse.status
        ).send("Map tile unavailable");
      }

      const contentType =
        upstreamResponse.headers.get(
          "content-type"
        ) || "image/png";

      const cacheControl =
        upstreamResponse.headers.get(
          "cache-control"
        );

      const expires =
        upstreamResponse.headers.get(
          "expires"
        );

      const etag =
        upstreamResponse.headers.get(
          "etag"
        );

      const lastModified =
        upstreamResponse.headers.get(
          "last-modified"
        );

      const tileBuffer = Buffer.from(
        await upstreamResponse.arrayBuffer()
      );

      res.setHeader(
        "Content-Type",
        contentType
      );

      if (cacheControl) {
        res.setHeader(
          "Cache-Control",
          cacheControl
        );
      }

      if (expires) {
        res.setHeader(
          "Expires",
          expires
        );
      }

      if (etag) {
        res.setHeader(
          "ETag",
          etag
        );
      }

      if (lastModified) {
        res.setHeader(
          "Last-Modified",
          lastModified
        );
      }

      res.setHeader(
        "X-Map-Source",
        "OpenStreetMap"
      );

      return res.status(200).send(
        tileBuffer
      );
    } catch (error) {
      console.error(
        "OpenStreetMap tile proxy error:",
        error
      );

      return res.status(502).json({
        status: "error",
        message: "Unable to load map tile",
      });
    }
  }
);

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
    console.error(
      "Database connection error:",
      error
    );

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `🚀 3D ULPIN API running on http://localhost:${PORT}`
  );
});
