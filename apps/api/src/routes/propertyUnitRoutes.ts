import { Router } from "express";
import { pool } from "../db/pool.js";
import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| GET ALL PROPERTY UNITS
| GET /api/property-units
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  authenticateToken,
  async (_req, res) => {
    try {
      const result = await pool.query(`
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
          b.building_name,

          p.parcel_number

        FROM property_units pu

        INNER JOIN floors f
          ON f.id = pu.floor_id

        INNER JOIN buildings b
          ON b.id = f.building_id

        INNER JOIN parcels p
          ON p.id = b.parcel_id

        ORDER BY
          b.building_name,
          f.floor_number,
          pu.unit_number
      `);

      return res.json({
        status: "ok",
        property_units: result.rows,
      });
    } catch (error) {
      console.error(
        "Property unit list error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to fetch property units",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GENERATE PROPERTY UNITS
| POST /api/property-units/generate
|--------------------------------------------------------------------------
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
        building_id,
        units_per_floor,
      } = req.body;

      if (!building_id) {
        return res.status(400).json({
          status: "error",
          message:
            "building_id is required",
        });
      }

      const unitsPerFloor = Number(
        units_per_floor ?? 4
      );

      if (
        !Number.isInteger(
          unitsPerFloor
        ) ||
        unitsPerFloor < 1 ||
        unitsPerFloor > 100
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "units_per_floor must be an integer between 1 and 100",
        });
      }

      await client.query("BEGIN");

      /*
       * ---------------------------------------------------------------
       * LOAD BUILDING
       * ---------------------------------------------------------------
       */

      const buildingResult =
        await client.query(
          `
          SELECT
            b.id,
            b.parcel_id,
            b.number_of_floors,
            b.created_at,
            p.ulpin,

            (
              SELECT COUNT(*) + 1
              FROM buildings b2
              WHERE b2.parcel_id = b.parcel_id
                AND (
                  b2.created_at < b.created_at
                  OR (
                    b2.created_at = b.created_at
                    AND b2.id < b.id
                  )
                )
            ) AS building_number

          FROM buildings b

          INNER JOIN parcels p
            ON p.id = b.parcel_id

          WHERE b.id = $1::uuid
          `,
          [building_id]
        );

      if (
        buildingResult.rowCount === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          status: "error",
          message:
            "Building not found",
        });
      }

      const building =
        buildingResult.rows[0];

      const buildingNumber = Number(
        building.building_number
      );

      if (
        !Number.isInteger(
          buildingNumber
        ) ||
        buildingNumber < 1
      ) {
        throw new Error(
          "Invalid building number"
        );
      }

      /*
       * ---------------------------------------------------------------
       * RE-GENERATION SAFETY
       * ---------------------------------------------------------------
       */

      await client.query(
        `
        DELETE FROM property_units
        WHERE floor_id IN (
          SELECT id
          FROM floors
          WHERE building_id = $1::uuid
        )
        `,
        [building.id]
      );

      /*
       * ---------------------------------------------------------------
       * LOAD FLOORS
       * ---------------------------------------------------------------
       */

      const floorsResult =
        await client.query(
          `
          SELECT
            id,
            floor_number,
            min_z,
            max_z,
            geometry

          FROM floors

          WHERE building_id = $1::uuid

          ORDER BY floor_number
          `,
          [building.id]
        );

      if (
        floorsResult.rowCount === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          status: "error",
          message:
            "No floors found for this building",
        });
      }

      const propertyUnits: unknown[] =
        [];

      /*
       * ---------------------------------------------------------------
       * GENERATE UNITS FLOOR BY FLOOR
       * ---------------------------------------------------------------
       */

      for (const floor of floorsResult.rows) {
        const floorNumber = Number(
          floor.floor_number
        );

        const boundsResult =
          await client.query(
            `
            SELECT
              ST_XMin(box) AS min_x,
              ST_YMin(box) AS min_y,
              ST_XMax(box) AS max_x,
              ST_YMax(box) AS max_y

            FROM (
              SELECT
                ST_3DExtent(
                  geometry
                ) AS box

              FROM floors

              WHERE id = $1::uuid
            ) AS extent_data
            `,
            [floor.id]
          );

        const bounds =
          boundsResult.rows[0];

        if (!bounds) {
          throw new Error(
            `Could not determine bounds for floor ${floorNumber}`
          );
        }

        const minX = Number(
          bounds.min_x
        );

        const minY = Number(
          bounds.min_y
        );

        const maxX = Number(
          bounds.max_x
        );

        const maxY = Number(
          bounds.max_y
        );

        if (
          !Number.isFinite(minX) ||
          !Number.isFinite(minY) ||
          !Number.isFinite(maxX) ||
          !Number.isFinite(maxY)
        ) {
          throw new Error(
            `Invalid floor bounds for floor ${floorNumber}`
          );
        }

        if (
          maxX <= minX ||
          maxY <= minY
        ) {
          throw new Error(
            `Invalid floor geometry bounds for floor ${floorNumber}`
          );
        }

        const unitWidth =
          (maxX - minX) /
          unitsPerFloor;

        /*
         * -------------------------------------------------------------
         * CREATE UNITS
         * -------------------------------------------------------------
         */

        for (
          let unitIndex = 1;
          unitIndex <= unitsPerFloor;
          unitIndex++
        ) {
          const unitNumber =
            floorNumber * 100 +
            unitIndex;

          const unitMinX =
            minX +
            (unitIndex - 1) *
              unitWidth;

          const unitMaxX =
            minX +
            unitIndex * unitWidth;

          /*
           * -----------------------------------------------------------
           * UNIQUE VPID
           *
           * Example:
           * 12345678901236-B04-F02-U203
           * -----------------------------------------------------------
           */

          const verticalPropertyId =
            `${building.ulpin}-B${String(
              buildingNumber
            ).padStart(
              2,
              "0"
            )}-F${String(
              floorNumber
            ).padStart(
              2,
              "0"
            )}-U${unitNumber}`;

          /*
           * -----------------------------------------------------------
           * CALCULATE AREA
           * -----------------------------------------------------------
           */

          const areaResult =
            await client.query(
              `
              SELECT
                ROUND(
                  ST_Area(
                    ST_Force2D(
                      ST_Transform(
                        ST_SetSRID(
                          ST_3DMakeBox(
                            ST_MakePoint(
                              $1::double precision,
                              $2::double precision,
                              $3::double precision
                            ),

                            ST_MakePoint(
                              $4::double precision,
                              $5::double precision,
                              $6::double precision
                            )
                          ),
                          4326
                        ),
                        32643
                      )
                    )
                  )::numeric,
                  2
                ) AS area_sq_m
              `,
              [
                unitMinX,
                minY,
                floor.min_z,
                unitMaxX,
                maxY,
                floor.max_z,
              ]
            );

          const areaSqM = Number(
            areaResult.rows[0]
              .area_sq_m
          );

          if (
            !Number.isFinite(
              areaSqM
            )
          ) {
            throw new Error(
              `Could not calculate area for ${verticalPropertyId}`
            );
          }

          /*
           * -----------------------------------------------------------
           * INSERT PROPERTY UNIT
           * -----------------------------------------------------------
           */

          const unitResult =
            await client.query(
              `
              INSERT INTO property_units (
                floor_id,
                unit_number,
                parent_ulpin,
                vertical_property_id,
                area_sq_m,
                min_z,
                max_z,
                geometry
              )

              VALUES (
                $1::uuid,
                $2::varchar,
                $3::varchar,
                $4::varchar,
                $5::numeric,
                $6::numeric,
                $7::numeric,

                ST_3DMakeBox(
                  ST_MakePoint(
                    $8::double precision,
                    $9::double precision,
                    $6::double precision
                  ),

                  ST_MakePoint(
                    $10::double precision,
                    $11::double precision,
                    $7::double precision
                  )
                )
              )

              RETURNING
                id,
                floor_id,
                unit_number,
                parent_ulpin,
                vertical_property_id,
                area_sq_m,
                min_z,
                max_z
              `,
              [
                floor.id,
                String(unitNumber),
                building.ulpin,
                verticalPropertyId,
                areaSqM,
                floor.min_z,
                floor.max_z,
                unitMinX,
                minY,
                unitMaxX,
                maxY,
              ]
            );

          propertyUnits.push(
            unitResult.rows[0]
          );
        }
      }

      await client.query("COMMIT");

      return res.status(201).json({
        status: "ok",

        message:
          "Property units generated successfully",

        building_id:
          building.id,

        parent_ulpin:
          building.ulpin,

        building_number:
          buildingNumber,

        total_units:
          propertyUnits.length,

        units:
          propertyUnits,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Property unit generation error:",
        error
      );

      const details =
        error instanceof Error
          ? error.message
          : "Unknown database error";

      return res.status(500).json({
        status: "error",

        message:
          "Failed to generate property units",

        details,
      });
    } finally {
      client.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| REGISTER PROPERTY
| POST /api/property-units/register
|--------------------------------------------------------------------------
*/

router.post(
  "/register",
  authenticateToken,
  requireRole(
    "ADMIN",
    "GOVERNMENT_OFFICER"
  ),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        property_unit_id,
        owner_name,
        contact,
        ownership_percentage,
        valid_from,
      } = req.body;

      if (
        !property_unit_id ||
        !owner_name
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "property_unit_id and owner_name are required",
        });
      }

      const cleanOwnerName =
        String(owner_name).trim();

      const cleanContact = contact
        ? String(contact).trim()
        : null;

      if (!cleanOwnerName) {
        return res.status(400).json({
          status: "error",
          message:
            "Owner name cannot be empty",
        });
      }

      const ownershipPercentage =
        Number(
          ownership_percentage ?? 100
        );

      if (
        !Number.isFinite(
          ownershipPercentage
        ) ||
        ownershipPercentage <= 0 ||
        ownershipPercentage > 100
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "ownership_percentage must be between 0 and 100",
        });
      }

      const registrationDate =
        valid_from ||
        new Date()
          .toISOString()
          .slice(0, 10);

      const registrationDateObject =
        new Date(
          registrationDate
        );

      if (
        Number.isNaN(
          registrationDateObject.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Invalid valid_from date",
        });
      }

      await client.query("BEGIN");

      /*
       * ---------------------------------------------------------------
       * LOAD PROPERTY
       * ---------------------------------------------------------------
       */

      const propertyResult =
        await client.query(
          `
          SELECT
            pu.id,
            pu.unit_number,
            pu.vertical_property_id,
            pu.parent_ulpin,

            f.floor_number,
            f.floor_label,

            b.id AS building_id,
            b.building_name

          FROM property_units pu

          INNER JOIN floors f
            ON f.id = pu.floor_id

          INNER JOIN buildings b
            ON b.id = f.building_id

          WHERE pu.id = $1::uuid
          `,
          [property_unit_id]
        );

      if (
        propertyResult.rowCount === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          status: "error",
          message:
            "Property unit not found",
        });
      }

      const property =
        propertyResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * CHECK ACTIVE OWNER
       * ---------------------------------------------------------------
       */

      const activeOwnershipResult =
        await client.query(
          `
          SELECT
            po.id,
            po.owner_id,
            o.name AS owner_name,
            o.contact,
            po.ownership_percentage,
            po.valid_from

          FROM property_ownership po

          INNER JOIN owners o
            ON o.id = po.owner_id

          WHERE
            po.property_unit_id = $1::uuid
            AND po.valid_to IS NULL

          LIMIT 1
          `,
          [property_unit_id]
        );

      if (
        activeOwnershipResult.rowCount !==
        0
      ) {
        await client.query(
          "ROLLBACK"
        );

        const existingOwner =
          activeOwnershipResult.rows[0];

        return res.status(409).json({
          status: "error",
          message:
            "Property is already registered",

          owner: {
            id:
              existingOwner.owner_id,

            name:
              existingOwner.owner_name,

            contact:
              existingOwner.contact,
          },
        });
      }

      /*
       * ---------------------------------------------------------------
       * FIND EXISTING OWNER
       * ---------------------------------------------------------------
       */

      let ownerId:
        | string
        | undefined;

      if (cleanContact) {
        const existingOwnerResult =
          await client.query(
            `
            SELECT id
            FROM owners

            WHERE
              LOWER(name) =
                LOWER($1)
              AND contact = $2

            LIMIT 1
            `,
            [
              cleanOwnerName,
              cleanContact,
            ]
          );

        if (
          existingOwnerResult.rowCount !==
          0
        ) {
          ownerId =
            existingOwnerResult.rows[0].id;
        }
      }

      /*
       * ---------------------------------------------------------------
       * CREATE OWNER IF REQUIRED
       * ---------------------------------------------------------------
       */

      if (!ownerId) {
        const ownerResult =
          await client.query(
            `
            INSERT INTO owners (
              name,
              contact
            )

            VALUES (
              $1,
              $2
            )

            RETURNING
              id,
              name,
              contact,
              created_at
            `,
            [
              cleanOwnerName,
              cleanContact,
            ]
          );

        ownerId =
          ownerResult.rows[0].id;
      }

      /*
       * ---------------------------------------------------------------
       * CREATE OWNERSHIP RECORD
       * ---------------------------------------------------------------
       */

      const ownershipResult =
        await client.query(
          `
          INSERT INTO property_ownership (
            property_unit_id,
            owner_id,
            ownership_percentage,
            valid_from,
            valid_to
          )

          VALUES (
            $1::uuid,
            $2::uuid,
            $3::numeric,
            $4::date,
            NULL
          )

          RETURNING
            id,
            property_unit_id,
            owner_id,
            ownership_percentage,
            valid_from,
            valid_to,
            created_at
          `,
          [
            property_unit_id,
            ownerId,
            ownershipPercentage,
            registrationDate,
          ]
        );

      await client.query("COMMIT");

      return res.status(201).json({
        status: "ok",

        message:
          "Property registered successfully",

        property: {
          id: property.id,

          unit_number:
            property.unit_number,

          vertical_property_id:
            property.vertical_property_id,

          parent_ulpin:
            property.parent_ulpin,

          floor_number:
            Number(
              property.floor_number
            ),

          floor_label:
            property.floor_label,

          building: {
            id:
              property.building_id,

            name:
              property.building_name,
          },

          owner: {
            id: ownerId,

            name:
              cleanOwnerName,

            contact:
              cleanContact,
          },

          ownership: {
            id:
              ownershipResult.rows[0]
                .id,

            percentage:
              Number(
                ownershipResult.rows[0]
                  .ownership_percentage
              ),

            valid_from:
              ownershipResult.rows[0]
                .valid_from,

            valid_to: null,
          },
        },
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Property registration error:",
        error
      );

      const details =
        error instanceof Error
          ? error.message
          : "Unknown database error";

      return res.status(500).json({
        status: "error",

        message:
          "Failed to register property",

        details,
      });
    } finally {
      client.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| TRANSFER PROPERTY OWNERSHIP
| POST /api/property-units/transfer
|--------------------------------------------------------------------------
*/

router.post(
  "/transfer",
  authenticateToken,
  requireRole(
    "ADMIN",
    "GOVERNMENT_OFFICER"
  ),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        property_unit_id,
        new_owner_name,
        new_owner_contact,
        ownership_percentage,
        transfer_date,
      } = req.body;

      /*
       * ---------------------------------------------------------------
       * VALIDATION
       * ---------------------------------------------------------------
       */

      if (
        !property_unit_id ||
        !new_owner_name
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "property_unit_id and new_owner_name are required",
        });
      }

      const cleanOwnerName =
        String(
          new_owner_name
        ).trim();

      const cleanContact =
        new_owner_contact
          ? String(
              new_owner_contact
            ).trim()
          : null;

      if (!cleanOwnerName) {
        return res.status(400).json({
          status: "error",

          message:
            "New owner name cannot be empty",
        });
      }

      const ownershipPercentage =
        Number(
          ownership_percentage ?? 100
        );

      if (
        !Number.isFinite(
          ownershipPercentage
        ) ||
        ownershipPercentage <= 0 ||
        ownershipPercentage > 100
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "ownership_percentage must be between 0 and 100",
        });
      }

      const transferDate =
        transfer_date ||
        new Date()
          .toISOString()
          .slice(0, 10);

      const transferDateObject =
        new Date(
          transferDate
        );

      if (
        Number.isNaN(
          transferDateObject.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Invalid transfer_date",
        });
      }

      await client.query("BEGIN");

      /*
       * ---------------------------------------------------------------
       * LOAD PROPERTY
       * ---------------------------------------------------------------
       */

      const propertyResult =
        await client.query(
          `
          SELECT
            pu.id,
            pu.unit_number,
            pu.vertical_property_id,
            pu.parent_ulpin,

            f.floor_number,
            f.floor_label,

            b.id AS building_id,
            b.building_name

          FROM property_units pu

          INNER JOIN floors f
            ON f.id = pu.floor_id

          INNER JOIN buildings b
            ON b.id = f.building_id

          WHERE pu.id = $1::uuid
          `,
          [property_unit_id]
        );

      if (
        propertyResult.rowCount === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          status: "error",

          message:
            "Property unit not found",
        });
      }

      const property =
        propertyResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * GET CURRENT OWNER
       * ---------------------------------------------------------------
       */

      const currentOwnershipResult =
        await client.query(
          `
          SELECT
            po.id,
            po.owner_id,
            o.name AS owner_name,
            o.contact,
            po.ownership_percentage,
            po.valid_from

          FROM property_ownership po

          INNER JOIN owners o
            ON o.id = po.owner_id

          WHERE
            po.property_unit_id =
              $1::uuid
            AND po.valid_to IS NULL

          ORDER BY
            po.valid_from DESC

          LIMIT 1
          `,
          [property_unit_id]
        );

      if (
        currentOwnershipResult.rowCount ===
        0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          status: "error",

          message:
            "Property does not have an active owner",
        });
      }

      const currentOwnership =
        currentOwnershipResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * VALIDATE TRANSFER DATE
       * ---------------------------------------------------------------
       */

      const currentValidFrom =
        new Date(
          currentOwnership.valid_from
        );

      if (
        transferDateObject <
        currentValidFrom
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          status: "error",

          message:
            "Transfer date cannot be earlier than the current ownership start date",
        });
      }

      /*
       * ---------------------------------------------------------------
       * PREVENT SAME OWNER TRANSFER
       * ---------------------------------------------------------------
       */

      const sameName =
        currentOwnership.owner_name
          .trim()
          .toLowerCase() ===
        cleanOwnerName.toLowerCase();

      const sameContact =
        (
          currentOwnership.contact ??
          null
        ) === cleanContact;

      if (
        sameName &&
        sameContact
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          status: "error",

          message:
            "New owner is already the current owner",
        });
      }

      /*
       * ---------------------------------------------------------------
       * CLOSE CURRENT OWNERSHIP
       * ---------------------------------------------------------------
       */

      await client.query(
        `
        UPDATE property_ownership

        SET valid_to = $1::date

        WHERE id = $2::uuid
          AND valid_to IS NULL
        `,
        [
          transferDate,
          currentOwnership.id,
        ]
      );

      /*
       * ---------------------------------------------------------------
       * FIND EXISTING OWNER
       * ---------------------------------------------------------------
       */

      let newOwnerId:
        | string
        | undefined;

      if (cleanContact) {
        const existingOwnerResult =
          await client.query(
            `
            SELECT id
            FROM owners

            WHERE
              LOWER(name) =
                LOWER($1)
              AND contact = $2

            LIMIT 1
            `,
            [
              cleanOwnerName,
              cleanContact,
            ]
          );

        if (
          existingOwnerResult.rowCount !==
          0
        ) {
          newOwnerId =
            existingOwnerResult.rows[0].id;
        }
      }

      /*
       * ---------------------------------------------------------------
       * CREATE NEW OWNER IF REQUIRED
       * ---------------------------------------------------------------
       */

      if (!newOwnerId) {
        const ownerResult =
          await client.query(
            `
            INSERT INTO owners (
              name,
              contact
            )

            VALUES (
              $1,
              $2
            )

            RETURNING
              id,
              name,
              contact,
              created_at
            `,
            [
              cleanOwnerName,
              cleanContact,
            ]
          );

        newOwnerId =
          ownerResult.rows[0].id;
      }

      /*
       * ---------------------------------------------------------------
       * CREATE NEW ACTIVE OWNERSHIP
       * ---------------------------------------------------------------
       */

      const newOwnershipResult =
        await client.query(
          `
          INSERT INTO property_ownership (
            property_unit_id,
            owner_id,
            ownership_percentage,
            valid_from,
            valid_to
          )

          VALUES (
            $1::uuid,
            $2::uuid,
            $3::numeric,
            $4::date,
            NULL
          )

          RETURNING
            id,
            property_unit_id,
            owner_id,
            ownership_percentage,
            valid_from,
            valid_to,
            created_at
          `,
          [
            property_unit_id,
            newOwnerId,
            ownershipPercentage,
            transferDate,
          ]
        );

      /*
       * ---------------------------------------------------------------
       * GET COMPLETE OWNERSHIP HISTORY
       * ---------------------------------------------------------------
       */

      const ownershipHistoryResult =
        await client.query(
          `
          SELECT
            po.id AS ownership_id,
            po.owner_id,
            o.name AS owner_name,
            o.contact,

            po.ownership_percentage,
            po.valid_from,
            po.valid_to,

            po.created_at

          FROM property_ownership po

          INNER JOIN owners o
            ON o.id = po.owner_id

          WHERE
            po.property_unit_id =
              $1::uuid

          ORDER BY
            po.valid_from DESC,
            po.created_at DESC
          `,
          [property_unit_id]
        );

      const ownershipHistory =
        ownershipHistoryResult.rows;

      const currentOwner =
        ownershipHistory.find(
          (ownership) =>
            ownership.valid_to ===
            null
        );

      const previousOwners =
        ownershipHistory.filter(
          (ownership) =>
            ownership.valid_to !==
            null
        );

      await client.query("COMMIT");

      /*
       * ---------------------------------------------------------------
       * RESPONSE
       * ---------------------------------------------------------------
       */

      return res.status(200).json({
        status: "ok",

        message:
          "Property ownership transferred successfully",

        property: {
          id: property.id,

          vertical_property_id:
            property.vertical_property_id,

          parent_ulpin:
            property.parent_ulpin,

          unit_number:
            property.unit_number,

          floor_number:
            Number(
              property.floor_number
            ),

          floor_label:
            property.floor_label,

          building: {
            id:
              property.building_id,

            name:
              property.building_name,
          },
        },

        previous_owners:
          previousOwners.map(
            (owner) => ({
              id:
                owner.ownership_id,

              owner_id:
                owner.owner_id,

              name:
                owner.owner_name,

              contact:
                owner.contact,

              ownership_percentage:
                Number(
                  owner.ownership_percentage
                ),

              valid_from:
                owner.valid_from,

              valid_to:
                owner.valid_to,
            })
          ),

        current_owner:
          currentOwner
            ? {
                id:
                  currentOwner
                    .ownership_id,

                owner_id:
                  currentOwner
                    .owner_id,

                name:
                  currentOwner
                    .owner_name,

                contact:
                  currentOwner.contact,

                ownership_percentage:
                  Number(
                    currentOwner
                      .ownership_percentage
                  ),

                valid_from:
                  currentOwner.valid_from,

                valid_to: null,
              }
            : null,

        transfer: {
          transfer_date:
            transferDate,
        },
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Property ownership transfer error:",
        error
      );

      const details =
        error instanceof Error
          ? error.message
          : "Unknown database error";

      return res.status(500).json({
        status: "error",

        message:
          "Failed to transfer property ownership",

        details,
      });
    } finally {
      client.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET OWNERSHIP HISTORY
| GET /api/property-units/:verticalPropertyId/history
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This route must appear BEFORE the generic
| /:verticalPropertyId route.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/:verticalPropertyId/history",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        verticalPropertyId,
      } = req.params;

      /*
       * ---------------------------------------------------------------
       * LOAD PROPERTY
       * ---------------------------------------------------------------
       */

      const propertyResult =
        await pool.query(
          `
          SELECT
            pu.id,
            pu.unit_number,
            pu.parent_ulpin,
            pu.vertical_property_id,

            f.floor_number,
            f.floor_label,

            b.id AS building_id,
            b.building_name

          FROM property_units pu

          INNER JOIN floors f
            ON f.id = pu.floor_id

          INNER JOIN buildings b
            ON b.id = f.building_id

          WHERE
            pu.vertical_property_id = $1

          LIMIT 1
          `,
          [verticalPropertyId]
        );

      if (
        propertyResult.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",

          message:
            "Property unit not found",
        });
      }

      const property =
        propertyResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * GET OWNERSHIP HISTORY
       * ---------------------------------------------------------------
       */

      const historyResult =
        await pool.query(
          `
          SELECT
            po.id AS ownership_id,
            po.owner_id,

            o.name AS owner_name,
            o.contact,

            po.ownership_percentage,
            po.valid_from,
            po.valid_to,
            po.created_at

          FROM property_ownership po

          INNER JOIN owners o
            ON o.id = po.owner_id

          WHERE
            po.property_unit_id =
              $1::uuid

          ORDER BY
            po.valid_from ASC,
            po.created_at ASC
          `,
          [property.id]
        );

      const history =
        historyResult.rows.map(
          (record) => ({
            id:
              record.ownership_id,

            owner_id:
              record.owner_id,

            name:
              record.owner_name,

            contact:
              record.contact,

            ownership_percentage:
              Number(
                record.ownership_percentage
              ),

            valid_from:
              record.valid_from,

            valid_to:
              record.valid_to,

            is_current:
              record.valid_to === null,
          })
        );

      const currentOwner =
        history.find(
          (record) =>
            record.is_current
        ) ?? null;

      return res.json({
        status: "ok",

        property: {
          id:
            property.id,

          vertical_property_id:
            property.vertical_property_id,

          parent_ulpin:
            property.parent_ulpin,

          unit_number:
            property.unit_number,

          floor_number:
            Number(
              property.floor_number
            ),

          floor_label:
            property.floor_label,

          building: {
            id:
              property.building_id,

            name:
              property.building_name,
          },
        },

        current_owner:
          currentOwner,

        ownership_history:
          history,
      });
    } catch (error) {
      console.error(
        "Ownership history error:",
        error
      );

      const details =
        error instanceof Error
          ? error.message
          : "Unknown database error";

      return res.status(500).json({
        status: "error",

        message:
          "Failed to fetch ownership history",

        details,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET PROPERTY UNIT DETAILS
| GET /api/property-units/:verticalPropertyId
|--------------------------------------------------------------------------
*/

router.get(
  "/:verticalPropertyId",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        verticalPropertyId,
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            pu.id,
            pu.unit_number,
            pu.parent_ulpin,
            pu.vertical_property_id,
            pu.area_sq_m,
            pu.min_z,
            pu.max_z,

            f.floor_number,
            f.floor_label,

            b.id AS building_id,
            b.building_name,

            o.id AS owner_id,
            o.name AS owner_name,
            o.contact AS owner_contact,
            po.ownership_percentage,

            pt.assessment_year,
            pt.assessed_value,
            pt.tax_amount,
            pt.payment_status,

            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'utility_type',
                  u.utility_type,

                  'connection_number',
                  u.connection_number,

                  'provider',
                  u.provider,

                  'status',
                  u.status
                )
              ) FILTER (
                WHERE u.id IS NOT NULL
              ),
              '[]'::json
            ) AS utilities

          FROM property_units pu

          INNER JOIN floors f
            ON f.id = pu.floor_id

          INNER JOIN buildings b
            ON b.id = f.building_id

          /*
           * ONLY ACTIVE OWNER
           *
           * This is important.
           *
           * valid_to IS NULL =
           * current owner.
           */

          LEFT JOIN property_ownership po
            ON po.property_unit_id =
              pu.id
            AND po.valid_to IS NULL

          LEFT JOIN owners o
            ON o.id = po.owner_id

          LEFT JOIN property_tax pt
            ON pt.property_unit_id =
              pu.id
            AND pt.assessment_year =
              2026

          LEFT JOIN utilities u
            ON u.property_unit_id =
              pu.id

          WHERE
            pu.vertical_property_id = $1

          GROUP BY
            pu.id,
            pu.unit_number,
            pu.parent_ulpin,
            pu.vertical_property_id,
            pu.area_sq_m,
            pu.min_z,
            pu.max_z,

            f.floor_number,
            f.floor_label,

            b.id,
            b.building_name,

            o.id,
            o.name,
            o.contact,

            po.ownership_percentage,

            pt.assessment_year,
            pt.assessed_value,
            pt.tax_amount,
            pt.payment_status
          `,
          [verticalPropertyId]
        );

      if (
        result.rowCount === 0
      ) {
        return res.status(404).json({
          status: "error",

          message:
            "Property unit not found",
        });
      }

      const property =
        result.rows[0];

      return res.json({
        status: "ok",

        property: {
          id:
            property.id,

          vertical_property_id:
            property.vertical_property_id,

          parent_ulpin:
            property.parent_ulpin,

          unit: {
            number:
              property.unit_number,

            floor:
              Number(
                property.floor_number
              ),

            floor_label:
              property.floor_label,

            area_sq_m:
              Number(
                property.area_sq_m
              ),

            min_z:
              Number(
                property.min_z
              ),

            max_z:
              Number(
                property.max_z
              ),
          },

          building: {
            id:
              property.building_id,

            name:
              property.building_name,
          },

          /*
           * -----------------------------------------------------------
           * CURRENT OWNER
           * -----------------------------------------------------------
           */

          owner:
            property.owner_name
              ? {
                  id:
                    property.owner_id,

                  name:
                    property.owner_name,

                  contact:
                    property.owner_contact,

                  ownership_percentage:
                    Number(
                      property
                        .ownership_percentage ??
                        0
                    ),
                }
              : null,

          /*
           * -----------------------------------------------------------
           * TAX
           * -----------------------------------------------------------
           */

          tax:
            property.assessment_year
              ? {
                  assessment_year:
                    Number(
                      property
                        .assessment_year
                    ),

                  assessed_value:
                    Number(
                      property
                        .assessed_value ??
                        0
                    ),

                  tax_amount:
                    Number(
                      property
                        .tax_amount ??
                        0
                    ),

                  payment_status:
                    property
                      .payment_status,
                }
              : null,

          /*
           * -----------------------------------------------------------
           * UTILITIES
           * -----------------------------------------------------------
           */

          utilities:
            property.utilities,
        },
      });
    } catch (error) {
      console.error(
        "Property details error:",
        error
      );

      return res.status(500).json({
        status: "error",

        message:
          "Failed to fetch property details",
      });
    }
  }
);

export default router;