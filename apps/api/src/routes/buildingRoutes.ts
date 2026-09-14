import { Router } from "express";
import { pool } from "../db/pool.js";
import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| GET ALL BUILDINGS
| GET /api/buildings
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  authenticateToken,
  async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          b.id,
          b.parcel_id,
          b.building_name,
          b.number_of_floors,
          b.floor_height_m,
          b.base_elevation_m,

          b.state,

          COUNT(f.id)::int AS floors,

          p.ulpin,
          p.parcel_number,

          b.created_at

        FROM buildings b

        LEFT JOIN floors f
          ON f.building_id = b.id

        LEFT JOIN parcels p
          ON p.id = b.parcel_id

        GROUP BY
          b.id,
          b.parcel_id,
          b.building_name,
          b.number_of_floors,
          b.floor_height_m,
          b.base_elevation_m,
          b.state,
          p.ulpin,
          p.parcel_number

        ORDER BY b.created_at DESC
      `);

      res.json({
        status: "ok",
        buildings: result.rows,
      });
    } catch (error) {
      console.error(
        "Building fetch error:",
        error
      );

      res.status(500).json({
        status: "error",
        message: "Failed to fetch buildings",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET ONE BUILDING
| GET /api/buildings/:id
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      const buildingResult =
        await pool.query(
          `
          SELECT
            b.id,
            b.parcel_id,
            b.building_name,
            b.number_of_floors,
            b.floor_height_m,
            b.base_elevation_m,

            b.state,

            COUNT(f.id)::int AS floors,

            p.ulpin,
            p.parcel_number,
            p.area_sq_m AS parcel_area_sq_m,

            b.created_at

          FROM buildings b

          LEFT JOIN floors f
            ON f.building_id = b.id

          LEFT JOIN parcels p
            ON p.id = b.parcel_id

          WHERE b.id = $1

          GROUP BY
            b.id,
            b.parcel_id,
            b.building_name,
            b.number_of_floors,
            b.floor_height_m,
            b.base_elevation_m,
            b.state,
            p.ulpin,
            p.parcel_number,
            p.area_sq_m
          `,
          [id]
        );

      if (
        buildingResult.rows.length === 0
      ) {
        return res.status(404).json({
          status: "error",
          message: "Building not found",
        });
      }

      const floorsResult =
        await pool.query(
          `
          SELECT
            id,
            building_id,
            floor_number,
            floor_label,
            min_z,
            max_z

          FROM floors

          WHERE building_id = $1

          ORDER BY floor_number
          `,
          [id]
        );

      res.json({
        status: "ok",
        building:
          buildingResult.rows[0],
        floors:
          floorsResult.rows,
      });
    } catch (error) {
      console.error(
        "Building detail error:",
        error
      );

      res.status(500).json({
        status: "error",
        message:
          "Failed to fetch building",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET BUILDING 3D DATA
| GET /api/buildings/:id/3d
|--------------------------------------------------------------------------
*/

router.get(
  "/:id/3d",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      /*
      |--------------------------------------------------------------------------
      | BUILDING
      |--------------------------------------------------------------------------
      */

      const buildingResult =
        await pool.query(
          `
          SELECT
            b.id,
            b.parcel_id,
            b.building_name,
            b.number_of_floors,
            b.floor_height_m,
            b.base_elevation_m,

            b.state,

            COUNT(f.id)::int AS floors,

            p.ulpin,
            p.parcel_number

          FROM buildings b

          LEFT JOIN floors f
            ON f.building_id = b.id

          LEFT JOIN parcels p
            ON p.id = b.parcel_id

          WHERE b.id = $1

          GROUP BY
            b.id,
            b.parcel_id,
            b.building_name,
            b.number_of_floors,
            b.floor_height_m,
            b.base_elevation_m,
            b.state,
            p.ulpin,
            p.parcel_number
          `,
          [id]
        );

      if (
        buildingResult.rows.length === 0
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Building not found",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | FLOORS
      |--------------------------------------------------------------------------
      */

      const floorsResult =
        await pool.query(
          `
          SELECT
            id,
            building_id,
            floor_number,
            floor_label,
            min_z,
            max_z

          FROM floors

          WHERE building_id = $1

          ORDER BY floor_number
          `,
          [id]
        );

      /*
      |--------------------------------------------------------------------------
      | PROPERTY UNITS
      |--------------------------------------------------------------------------
      */

      const unitsResult =
        await pool.query(
          `
          SELECT
            pu.id,
            pu.floor_id,
            pu.unit_number,
            pu.parent_ulpin,
            pu.vertical_property_id,
            pu.area_sq_m,
            pu.min_z,
            pu.max_z,

            f.floor_number,
            f.floor_label,

            b.id AS building_id,
            b.state

          FROM property_units pu

          INNER JOIN floors f
            ON f.id = pu.floor_id

          INNER JOIN buildings b
            ON b.id = f.building_id

          WHERE f.building_id = $1

          ORDER BY
            f.floor_number,
            pu.unit_number
          `,
          [id]
        );

      res.json({
        status: "ok",

        building:
          buildingResult.rows[0],

        floors:
          floorsResult.rows,

        property_units:
          unitsResult.rows,
      });
    } catch (error) {
      console.error(
        "Building 3D fetch error:",
        error
      );

      res.status(500).json({
        status: "error",
        message:
          "Failed to fetch building 3D data",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GENERATE BUILDING
| POST /api/buildings/generate
|--------------------------------------------------------------------------
|
| Allowed roles:
|
| ADMIN
| GOVERNMENT_OFFICER
| SURVEYOR
|
*/

router.post(
  "/generate",
  authenticateToken,
  requireRole(
    "ADMIN",
    "GOVERNMENT_OFFICER",
    "SURVEYOR"
  ),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        parcel_id,
        building_name,

        country,
        state,
        district,
        city,
        area,
        street,
        pincode,
        address_line,

        floors,
        floor_height_m,
        base_elevation_m,
      } = req.body;

      /*
      |--------------------------------------------------------------------------
      | BASIC VALIDATION
      |--------------------------------------------------------------------------
      */

      if (!parcel_id) {
        return res.status(400).json({
          status: "error",
          message: "parcel_id is required",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | ADDRESS VALIDATION
      |--------------------------------------------------------------------------
      */

      const buildingCountry =
        String(country ?? "India").trim();

      const buildingState =
        String(state ?? "").trim();

      const buildingDistrict =
        String(district ?? "").trim();

      const buildingCity =
        String(city ?? "").trim();

      const buildingArea =
        String(area ?? "").trim();

      const buildingStreet =
        String(street ?? "").trim();

      const buildingPincode =
        String(pincode ?? "").trim();

      const buildingAddress =
        String(address_line ?? "").trim();

      if (buildingCountry !== "India") {
        return res.status(400).json({
          status: "error",
          message:
            "Country must be India",
        });
      }

      if (!buildingState) {
        return res.status(400).json({
          status: "error",
          message:
            "State is required",
        });
      }

      if (!buildingDistrict) {
        return res.status(400).json({
          status: "error",
          message:
            "District is required",
        });
      }

      if (!buildingCity) {
        return res.status(400).json({
          status: "error",
          message:
            "City is required",
        });
      }

      if (!buildingArea) {
        return res.status(400).json({
          status: "error",
          message:
            "Area / locality is required",
        });
      }

      if (!buildingStreet) {
        return res.status(400).json({
          status: "error",
          message:
            "Street / road is required",
        });
      }

      if (!/^\d{6}$/.test(buildingPincode)) {
        return res.status(400).json({
          status: "error",
          message:
            "Pincode must be exactly 6 digits",
        });
      }

      if (!buildingAddress) {
        return res.status(400).json({
          status: "error",
          message:
            "Address is required",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | NUMERIC VALIDATION
      |--------------------------------------------------------------------------
      */

      const numberOfFloors =
        Number(floors);

      const floorHeight =
        Number(floor_height_m);

      const baseElevation =
        Number(base_elevation_m);

      if (
        !Number.isInteger(numberOfFloors) ||
        numberOfFloors <= 0 ||
        numberOfFloors > 200
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "floors must be an integer between 1 and 200",
        });
      }

      if (
        !Number.isFinite(floorHeight) ||
        floorHeight <= 0
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "floor_height_m must be a positive number",
        });
      }

      if (!Number.isFinite(baseElevation)) {
        return res.status(400).json({
          status: "error",
          message:
            "base_elevation_m must be a valid number",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | START TRANSACTION
      |--------------------------------------------------------------------------
      */

      await client.query("BEGIN");

      /*
      |--------------------------------------------------------------------------
      | CHECK PARCEL
      |--------------------------------------------------------------------------
      */

      const parcelResult =
        await client.query(
          `
          SELECT
            id,
            ulpin,
            parcel_number,
            area_sq_m,
            geometry

          FROM parcels

          WHERE id = $1::uuid
          `,
          [parcel_id]
        );

      if (parcelResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          status: "error",
          message: "Parcel not found",
        });
      }

      const parcel =
        parcelResult.rows[0];

      /*
      |--------------------------------------------------------------------------
      | CREATE BUILDING
      |--------------------------------------------------------------------------
      */

      const buildingResult =
        await client.query(
          `
          INSERT INTO buildings (
            parcel_id,
            building_name,

            number_of_floors,
            floor_height_m,
            base_elevation_m,

            country,
            state,
            district,
            city,
            area,
            street,
            pincode,
            address_line,

            geometry
          )

          SELECT
            $1::uuid,
            $2::varchar,

            $3::integer,
            $4::numeric,
            $5::numeric,

            $6::varchar,
            $7::varchar,
            $8::varchar,
            $9::varchar,
            $10::varchar,
            $11::varchar,
            $12::varchar,
            $13::varchar,

            ST_3DMakeBox(
              ST_MakePoint(
                ST_XMin(
                  ST_Force2D(p.geometry)
                ),
                ST_YMin(
                  ST_Force2D(p.geometry)
                ),
                $5::double precision
              ),

              ST_MakePoint(
                ST_XMax(
                  ST_Force2D(p.geometry)
                ),
                ST_YMax(
                  ST_Force2D(p.geometry)
                ),
                (
                  $5::double precision
                  +
                  (
                    $3::double precision
                    *
                    $4::double precision
                  )
                )
              )
            )

          FROM parcels p

          WHERE p.id = $1::uuid

          RETURNING
            id,
            parcel_id,
            building_name,

            number_of_floors,
            floor_height_m,
            base_elevation_m,

            country,
            state,
            district,
            city,
            area,
            street,
            pincode,
            address_line,

            created_at
          `,
          [
            parcel_id,

            building_name?.trim() ||
              "New Building",

            numberOfFloors,
            floorHeight,
            baseElevation,

            buildingCountry,
            buildingState,
            buildingDistrict,
            buildingCity,
            buildingArea,
            buildingStreet,
            buildingPincode,
            buildingAddress,
          ]
        );

      if (buildingResult.rows.length === 0) {
        throw new Error(
          "Building could not be created"
        );
      }

      const building =
        buildingResult.rows[0];

      /*
      |--------------------------------------------------------------------------
      | CREATE FLOORS
      |--------------------------------------------------------------------------
      */

      for (
        let floor = 1;
        floor <= numberOfFloors;
        floor++
      ) {
        const minZ =
          baseElevation +
          (floor - 1) *
            floorHeight;

        const maxZ =
          baseElevation +
          floorHeight *
            floor;

        await client.query(
          `
          INSERT INTO floors (
            building_id,
            floor_number,
            floor_label,
            min_z,
            max_z,
            geometry
          )

          SELECT
            $1::uuid,
            $2::integer,
            $3::varchar,
            $4::numeric,
            $5::numeric,

            ST_3DMakeBox(
              ST_MakePoint(
                ST_XMin(
                  ST_Force2D(p.geometry)
                ),
                ST_YMin(
                  ST_Force2D(p.geometry)
                ),
                $4::double precision
              ),

              ST_MakePoint(
                ST_XMax(
                  ST_Force2D(p.geometry)
                ),
                ST_YMax(
                  ST_Force2D(p.geometry)
                ),
                $5::double precision
              )
            )

          FROM parcels p

          WHERE p.id = $6::uuid
          `,
          [
            building.id,
            floor,
            `Floor ${floor}`,
            minZ,
            maxZ,
            parcel_id,
          ]
        );
      }

      /*
      |--------------------------------------------------------------------------
      | COMMIT
      |--------------------------------------------------------------------------
      */

      await client.query("COMMIT");

      /*
      |--------------------------------------------------------------------------
      | SUCCESS
      |--------------------------------------------------------------------------
      */

      res.status(201).json({
        status: "ok",

        message:
          "3D building generated successfully",

        building: {
          ...building,

          ulpin:
            parcel.ulpin,

          parcel_number:
            parcel.parcel_number,
        },

        floors_created:
          numberOfFloors,

        total_height_m:
          numberOfFloors *
          floorHeight,
      });
    } catch (error) {
      /*
      |--------------------------------------------------------------------------
      | ROLLBACK
      |--------------------------------------------------------------------------
      */

      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Transaction rollback error:",
          rollbackError
        );
      }

      console.error(
        "Building generation error:",
        error
      );

      const databaseError =
        error as {
          code?: string;
          detail?: string;
          message?: string;
        };

      res.status(500).json({
        status: "error",

        message:
          "Failed to generate building",

        detail:
          databaseError.detail ||
          databaseError.message ||
          "Unknown database error",
      });
    } finally {
      client.release();
    }
  }
);

export default router;