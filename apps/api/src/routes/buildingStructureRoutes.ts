import { Router } from "express";

import { pool } from "../db/pool.js";

import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| ROLE DEFINITIONS
|--------------------------------------------------------------------------
*/

const surveyorWriteAccess = requireRole(
  "ADMIN",
  "SURVEYOR"
);

/*
|--------------------------------------------------------------------------
| GET COMPLETE BUILDING STRUCTURE
|
| GET /api/building-structure/:buildingId
|--------------------------------------------------------------------------
|
| Returns:
|
| Building
| ├── Floors
| │   └── Corridors
| ├── Apartments
| │   └── Rooms
| │       └── Washrooms
| └── Parking
|
|--------------------------------------------------------------------------
*/

router.get(
  "/:buildingId",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        buildingId,
      } = req.params;

      /*
       * ---------------------------------------------------------------
       * BUILDING
       * ---------------------------------------------------------------
       */

      const buildingResult =
        await pool.query(
          `
          SELECT
            b.id,
            b.building_name,
            b.number_of_floors,
            b.floor_height_m,
            b.base_elevation_m,

            b.country,
            b.state,
            b.district,
            b.city,
            b.area,
            b.street,
            b.pincode,
            b.address_line,

            p.id AS parcel_id,
            p.ulpin,
            p.parcel_number

          FROM buildings b

          INNER JOIN parcels p
            ON p.id = b.parcel_id

          WHERE b.id = $1::uuid

          LIMIT 1
          `,
          [buildingId]
        );

      if (
        buildingResult.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message: "Building not found",
        });
      }

      const building =
        buildingResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * FLOORS + CORRIDORS
       * ---------------------------------------------------------------
       */

      const floorsResult =
        await pool.query(
          `
          SELECT
            f.id,
            f.floor_number,
            f.floor_label,
            f.min_z,
            f.max_z,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', c.id,
                    'corridor_name',
                      c.corridor_name,
                    'corridor_type',
                      c.corridor_type,
                    'width_m',
                      c.width_m,
                    'length_m',
                      c.length_m
                  )
                  ORDER BY c.created_at
                )
                FROM corridors c
                WHERE c.floor_id = f.id
              ),
              '[]'::json
            ) AS corridors

          FROM floors f

          WHERE f.building_id =
            $1::uuid

          ORDER BY
            f.floor_number
          `,
          [buildingId]
        );

      /*
       * ---------------------------------------------------------------
       * APARTMENTS + ROOMS + WASHROOMS
       * ---------------------------------------------------------------
       */

      const apartmentsResult =
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

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', r.id,
                    'room_name',
                      r.room_name,
                    'room_type',
                      r.room_type,
                    'area_sq_m',
                      r.area_sq_m,
                    'floor_number',
                      r.floor_number,

                    'washrooms',
                    COALESCE(
                      (
                        SELECT json_agg(
                          json_build_object(
                            'id', w.id,
                            'washroom_name',
                              w.washroom_name,
                            'washroom_type',
                              w.washroom_type,
                            'area_sq_m',
                              w.area_sq_m
                          )
                          ORDER BY
                            w.created_at
                        )
                        FROM washrooms w
                        WHERE w.room_id = r.id
                      ),
                      '[]'::json
                    )
                  )
                  ORDER BY r.created_at
                )
                FROM rooms r
                WHERE
                  r.property_unit_id =
                    pu.id
              ),
              '[]'::json
            ) AS rooms

          FROM property_units pu

          INNER JOIN floors f
            ON f.id = pu.floor_id

          WHERE f.building_id =
            $1::uuid

          ORDER BY
            f.floor_number,
            pu.unit_number
          `,
          [buildingId]
        );

      /*
       * ---------------------------------------------------------------
       * PARKING
       * ---------------------------------------------------------------
       */

      const parkingResult =
        await pool.query(
          `
          SELECT
            ps.id,
            ps.parking_number,
            ps.parking_type,
            ps.parking_location,
            ps.area_sq_m,
            ps.is_covered,

            ps.property_unit_id,

            pu.unit_number,
            pu.vertical_property_id

          FROM parking_spaces ps

          LEFT JOIN property_units pu
            ON pu.id =
              ps.property_unit_id

          WHERE
            ps.building_id =
              $1::uuid

          ORDER BY
            ps.parking_number
          `,
          [buildingId]
        );

      /*
       * ---------------------------------------------------------------
       * BUILD FLOOR STRUCTURE
       * ---------------------------------------------------------------
       */

      const floors =
        floorsResult.rows.map(
          (floor) => {
            const apartments =
              apartmentsResult.rows
                .filter(
                  (unit) =>
                    unit.floor_id ===
                    floor.id
                )
                .map(
                  (unit) => ({
                    id: unit.id,

                    unit_number:
                      unit.unit_number,

                    vertical_property_id:
                      unit.vertical_property_id,

                    parent_ulpin:
                      unit.parent_ulpin,

                    area_sq_m:
                      Number(
                        unit.area_sq_m
                      ),

                    min_z:
                      Number(
                        unit.min_z
                      ),

                    max_z:
                      Number(
                        unit.max_z
                      ),

                    rooms:
                      unit.rooms ?? [],
                  })
                );

            return {
              id: floor.id,

              floor_number:
                Number(
                  floor.floor_number
                ),

              floor_label:
                floor.floor_label,

              min_z:
                Number(
                  floor.min_z
                ),

              max_z:
                Number(
                  floor.max_z
                ),

              corridors:
                floor.corridors ?? [],

              apartments,
            };
          }
        );

      /*
       * ---------------------------------------------------------------
       * PARKING RESPONSE
       * ---------------------------------------------------------------
       */

      const parking =
        parkingResult.rows.map(
          (space) => ({
            id: space.id,

            parking_number:
              space.parking_number,

            parking_type:
              space.parking_type,

            parking_location:
              space.parking_location,

            area_sq_m:
              space.area_sq_m === null
                ? null
                : Number(
                    space.area_sq_m
                  ),

            is_covered:
              space.is_covered,

            assigned_apartment:
              space.property_unit_id
                ? {
                    property_unit_id:
                      space.property_unit_id,

                    unit_number:
                      space.unit_number,

                    vertical_property_id:
                      space.vertical_property_id,
                  }
                : null,
          })
        );

      /*
       * ---------------------------------------------------------------
       * RESPONSE
       * ---------------------------------------------------------------
       */

      return res.json({
        status: "ok",

        building: {
          id: building.id,

          building_name:
            building.building_name,

          number_of_floors:
            Number(
              building.number_of_floors
            ),

          floor_height_m:
            Number(
              building.floor_height_m
            ),

          base_elevation_m:
            Number(
              building.base_elevation_m
            ),

          address: {
            country:
              building.country,

            state:
              building.state,

            district:
              building.district,

            city:
              building.city,

            area:
              building.area,

            street:
              building.street,

            pincode:
              building.pincode,

            address_line:
              building.address_line,
          },

          parcel: {
            id:
              building.parcel_id,

            ulpin:
              building.ulpin,

            parcel_number:
              building.parcel_number,
          },
        },

        floors,

        parking,
      });
    } catch (error) {
      console.error(
        "Building structure fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to fetch building structure",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADD CORRIDOR
|
| POST /api/building-structure/corridors
|--------------------------------------------------------------------------
*/

router.post(
  "/corridors",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const {
        floor_id,
        corridor_name,
        corridor_type,
        width_m,
        length_m,
      } = req.body;

      if (!floor_id) {
        return res.status(400).json({
          status: "error",
          message:
            "floor_id is required",
        });
      }

      const floorResult =
        await pool.query(
          `
          SELECT
            id,
            building_id
          FROM floors
          WHERE id = $1::uuid
          LIMIT 1
          `,
          [floor_id]
        );

      if (
        floorResult.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message: "Floor not found",
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO corridors (
            floor_id,
            corridor_name,
            corridor_type,
            width_m,
            length_m
          )

          VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5
          )

          RETURNING
            id,
            floor_id,
            corridor_name,
            corridor_type,
            width_m,
            length_m,
            created_at
          `,
          [
            floor_id,

            String(
              corridor_name ??
                "Shared Corridor"
            ).trim(),

            String(
              corridor_type ??
                "SHARED"
            ).toUpperCase(),

            width_m === undefined ||
            width_m === null ||
            width_m === ""
              ? null
              : Number(width_m),

            length_m === undefined ||
            length_m === null ||
            length_m === ""
              ? null
              : Number(length_m),
          ]
        );

      return res.status(201).json({
        status: "ok",

        message:
          "Corridor created successfully",

        corridor:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "Corridor creation error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to create corridor",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADD ROOM
|
| POST /api/building-structure/rooms
|--------------------------------------------------------------------------
*/

router.post(
  "/rooms",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const {
        property_unit_id,
        room_name,
        room_type,
        area_sq_m,
      } = req.body;

      if (
        !property_unit_id ||
        !room_name
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "property_unit_id and room_name are required",
        });
      }

      const unitResult =
        await pool.query(
          `
          SELECT
            pu.id,
            f.floor_number,
            f.building_id

          FROM property_units pu

          INNER JOIN floors f
            ON f.id = pu.floor_id

          WHERE pu.id = $1::uuid

          LIMIT 1
          `,
          [property_unit_id]
        );

      if (
        unitResult.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Property unit not found",
        });
      }

      const floorNumber =
        Number(
          unitResult.rows[0]
            .floor_number
        );

      const cleanRoomName =
        String(
          room_name
        ).trim();

      if (!cleanRoomName) {
        return res.status(400).json({
          status: "error",
          message:
            "room_name cannot be empty",
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO rooms (
            property_unit_id,
            room_name,
            room_type,
            area_sq_m,
            floor_number
          )

          VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5
          )

          RETURNING
            id,
            property_unit_id,
            room_name,
            room_type,
            area_sq_m,
            floor_number,
            created_at
          `,
          [
            property_unit_id,

            cleanRoomName,

            String(
              room_type ??
                "OTHER"
            ).toUpperCase(),

            area_sq_m === undefined ||
            area_sq_m === null ||
            area_sq_m === ""
              ? null
              : Number(area_sq_m),

            floorNumber,
          ]
        );

      return res.status(201).json({
        status: "ok",

        message:
          "Room created successfully",

        room:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "Room creation error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to create room",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADD WASHROOM
|
| POST /api/building-structure/washrooms
|--------------------------------------------------------------------------
*/

router.post(
  "/washrooms",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const {
        room_id,
        washroom_name,
        washroom_type,
        area_sq_m,
      } = req.body;

      if (
        !room_id ||
        !washroom_name
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "room_id and washroom_name are required",
        });
      }

      const roomResult =
        await pool.query(
          `
          SELECT id
          FROM rooms
          WHERE id = $1::uuid
          LIMIT 1
          `,
          [room_id]
        );

      if (
        roomResult.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message: "Room not found",
        });
      }

      const cleanName =
        String(
          washroom_name
        ).trim();

      if (!cleanName) {
        return res.status(400).json({
          status: "error",
          message:
            "washroom_name cannot be empty",
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO washrooms (
            room_id,
            washroom_name,
            washroom_type,
            area_sq_m
          )

          VALUES (
            $1::uuid,
            $2,
            $3,
            $4
          )

          RETURNING
            id,
            room_id,
            washroom_name,
            washroom_type,
            area_sq_m,
            created_at
          `,
          [
            room_id,

            cleanName,

            String(
              washroom_type ??
                "ATTACHED"
            ).toUpperCase(),

            area_sq_m === undefined ||
            area_sq_m === null ||
            area_sq_m === ""
              ? null
              : Number(area_sq_m),
          ]
        );

      return res.status(201).json({
        status: "ok",

        message:
          "Washroom created successfully",

        washroom:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "Washroom creation error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to create washroom",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADD PARKING SPACE
|
| POST /api/building-structure/parking
|--------------------------------------------------------------------------
*/

router.post(
  "/parking",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const {
        building_id,
        parking_number,
        parking_type,
        parking_location,
        area_sq_m,
        is_covered,
        property_unit_id,
      } = req.body;

      if (
        !building_id ||
        !parking_number
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "building_id and parking_number are required",
        });
      }

      /*
       * ---------------------------------------------------------------
       * VERIFY BUILDING
       * ---------------------------------------------------------------
       */

      const buildingResult =
        await pool.query(
          `
          SELECT id
          FROM buildings
          WHERE id = $1::uuid
          LIMIT 1
          `,
          [building_id]
        );

      if (
        buildingResult.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Building not found",
        });
      }

      /*
       * ---------------------------------------------------------------
       * VERIFY APARTMENT IF ASSIGNED
       * ---------------------------------------------------------------
       */

      if (property_unit_id) {
        const unitResult =
          await pool.query(
            `
            SELECT
              pu.id

            FROM property_units pu

            INNER JOIN floors f
              ON f.id = pu.floor_id

            WHERE
              pu.id = $1::uuid
              AND f.building_id =
                $2::uuid

            LIMIT 1
            `,
            [
              property_unit_id,
              building_id,
            ]
          );

        if (
          unitResult.rowCount ===
          0
        ) {
          return res.status(400).json({
            status: "error",
            message:
              "The selected apartment does not belong to this building",
          });
        }
      }

      const cleanParkingNumber =
        String(
          parking_number
        ).trim();

      if (
        !cleanParkingNumber
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "parking_number cannot be empty",
        });
      }

      /*
       * ---------------------------------------------------------------
       * INSERT PARKING
       * ---------------------------------------------------------------
       */

      const result =
        await pool.query(
          `
          INSERT INTO parking_spaces (
            building_id,
            parking_number,
            parking_type,
            parking_location,
            area_sq_m,
            is_covered,
            property_unit_id
          )

          VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::uuid
          )

          RETURNING
            id,
            building_id,
            parking_number,
            parking_type,
            parking_location,
            area_sq_m,
            is_covered,
            property_unit_id,
            created_at
          `,
          [
            building_id,

            cleanParkingNumber,

            String(
              parking_type ??
                "CAR"
            ).toUpperCase(),

            parking_location
              ? String(
                  parking_location
                ).trim()
              : null,

            area_sq_m === undefined ||
            area_sq_m === null ||
            area_sq_m === ""
              ? null
              : Number(area_sq_m),

            Boolean(
              is_covered ??
                false
            ),

            property_unit_id ??
              null,
          ]
        );

      return res.status(201).json({
        status: "ok",

        message:
          "Parking space created successfully",

        parking:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "Parking creation error:",
        error
      );

      /*
       * UNIQUE constraint
       */

      if (
        error instanceof Error &&
        error.message.includes(
          "unique_building_parking_number"
        )
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "This parking number already exists in the building",
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Failed to create parking space",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ASSIGN / REASSIGN PARKING
|
| PATCH /api/building-structure/parking/:parkingId
|--------------------------------------------------------------------------
|
| property_unit_id:
|
| UUID  -> assign parking to apartment
| null  -> make parking common/available
|
|--------------------------------------------------------------------------
*/

router.patch(
  "/parking/:parkingId",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const {
        parkingId,
      } = req.params;

      const {
        property_unit_id,
      } = req.body;

      /*
       * ---------------------------------------------------------------
       * LOAD PARKING
       * ---------------------------------------------------------------
       */

      const parkingResult =
        await pool.query(
          `
          SELECT
            id,
            building_id
          FROM parking_spaces
          WHERE id = $1::uuid
          LIMIT 1
          `,
          [parkingId]
        );

      if (
        parkingResult.rowCount ===
        0
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Parking space not found",
        });
      }

      const buildingId =
        parkingResult.rows[0]
          .building_id;

      /*
       * ---------------------------------------------------------------
       * VERIFY APARTMENT
       * ---------------------------------------------------------------
       */

      if (property_unit_id) {
        const unitResult =
          await pool.query(
            `
            SELECT
              pu.id

            FROM property_units pu

            INNER JOIN floors f
              ON f.id = pu.floor_id

            WHERE
              pu.id = $1::uuid
              AND f.building_id =
                $2::uuid

            LIMIT 1
            `,
            [
              property_unit_id,
              buildingId,
            ]
          );

        if (
          unitResult.rowCount ===
          0
        ) {
          return res.status(400).json({
            status: "error",
            message:
              "Apartment does not belong to the same building",
          });
        }
      }

      /*
       * ---------------------------------------------------------------
       * UPDATE ASSIGNMENT
       * ---------------------------------------------------------------
       */

      const result =
        await pool.query(
          `
          UPDATE parking_spaces

          SET
            property_unit_id =
              $1::uuid,
            updated_at =
              NOW()

          WHERE id =
            $2::uuid

          RETURNING
            id,
            building_id,
            parking_number,
            parking_type,
            parking_location,
            area_sq_m,
            is_covered,
            property_unit_id,
            updated_at
          `,
          [
            property_unit_id ??
              null,
            parkingId,
          ]
        );

      return res.json({
        status: "ok",

        message:
          property_unit_id
            ? "Parking assigned successfully"
            : "Parking released successfully",

        parking:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "Parking assignment error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to update parking assignment",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE CORRIDOR
|
| DELETE /api/building-structure/corridors/:id
|--------------------------------------------------------------------------
*/

router.delete(
  "/corridors/:id",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          DELETE FROM corridors
          WHERE id = $1::uuid
          RETURNING id
          `,
          [req.params.id]
        );

      if (
        result.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Corridor not found",
        });
      }

      return res.json({
        status: "ok",
        message:
          "Corridor deleted successfully",
      });
    } catch (error) {
      console.error(
        "Corridor deletion error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to delete corridor",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE ROOM
|
| DELETE /api/building-structure/rooms/:id
|--------------------------------------------------------------------------
|
| Washrooms are automatically deleted because
| washrooms.room_id uses ON DELETE CASCADE.
|
|--------------------------------------------------------------------------
*/

router.delete(
  "/rooms/:id",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          DELETE FROM rooms
          WHERE id = $1::uuid
          RETURNING id
          `,
          [req.params.id]
        );

      if (
        result.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Room not found",
        });
      }

      return res.json({
        status: "ok",
        message:
          "Room and its washrooms deleted successfully",
      });
    } catch (error) {
      console.error(
        "Room deletion error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to delete room",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE WASHROOM
|
| DELETE /api/building-structure/washrooms/:id
|--------------------------------------------------------------------------
*/

router.delete(
  "/washrooms/:id",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          DELETE FROM washrooms
          WHERE id = $1::uuid
          RETURNING id
          `,
          [req.params.id]
        );

      if (
        result.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Washroom not found",
        });
      }

      return res.json({
        status: "ok",
        message:
          "Washroom deleted successfully",
      });
    } catch (error) {
      console.error(
        "Washroom deletion error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to delete washroom",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE PARKING
|
| DELETE /api/building-structure/parking/:id
|--------------------------------------------------------------------------
*/

router.delete(
  "/parking/:id",
  authenticateToken,
  surveyorWriteAccess,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          DELETE FROM parking_spaces
          WHERE id = $1::uuid
          RETURNING id
          `,
          [req.params.id]
        );

      if (
        result.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Parking space not found",
        });
      }

      return res.json({
        status: "ok",
        message:
          "Parking space deleted successfully",
      });
    } catch (error) {
      console.error(
        "Parking deletion error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to delete parking space",
      });
    }
  }
);

export default router;