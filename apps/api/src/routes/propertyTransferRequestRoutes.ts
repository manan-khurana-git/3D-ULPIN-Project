import { Router } from "express";
import { pool } from "../db/pool.js";
import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| SUBMIT PROPERTY TRANSFER REQUEST
| POST /api/property-transfer-requests
|--------------------------------------------------------------------------
|
| CITIZEN only.
|
| Creates a PENDING transfer request.
| It does NOT change ownership.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  authenticateToken,
  requireRole("CITIZEN"),
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

      const submittedBy =
        (req as AuthenticatedRequest).user?.id;

      if (!submittedBy) {
        return res.status(401).json({
          status: "error",
          message:
            "Authenticated user ID not found",
        });
      }

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
        String(new_owner_name).trim();

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
        new Date(transferDate);

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

          WHERE
            pu.id = $1::uuid

          LIMIT 1
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
       * LOCK CURRENT OWNERSHIP
       * ---------------------------------------------------------------
       */

      const currentOwnershipResult =
        await client.query(
          `
          SELECT
            po.id,
            po.owner_id,
            o.name AS owner_name,
            o.contact AS owner_contact,
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

          FOR UPDATE
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
       * VERIFY TRANSFER DATE
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
       * PREVENT SAME OWNER
       * ---------------------------------------------------------------
       */

      const sameName =
        currentOwnership.owner_name
          .trim()
          .toLowerCase() ===
        cleanOwnerName.toLowerCase();

      const sameContact =
        (
          currentOwnership.owner_contact ??
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
       * PREVENT MULTIPLE PENDING REQUESTS
       * ---------------------------------------------------------------
       */

      const pendingRequestResult =
        await client.query(
          `
          SELECT
            id

          FROM property_transfer_requests

          WHERE
            property_unit_id =
              $1::uuid
            AND status = 'PENDING'

          LIMIT 1
          `,
          [property_unit_id]
        );

      if (
        pendingRequestResult.rowCount !==
        0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          status: "error",
          message:
            "A transfer request for this property is already pending",
        });
      }

      /*
       * ---------------------------------------------------------------
       * CREATE TRANSFER REQUEST
       * ---------------------------------------------------------------
       */

      const requestResult =
        await client.query(
          `
          INSERT INTO property_transfer_requests (
            property_unit_id,
            current_owner_id,
            new_owner_name,
            new_owner_contact,
            ownership_percentage,
            transfer_date,
            status,
            submitted_by
          )

          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5::numeric,
            $6::date,
            'PENDING',
            $7::uuid
          )

          RETURNING
            id,
            property_unit_id,
            current_owner_id,
            new_owner_name,
            new_owner_contact,
            ownership_percentage,
            transfer_date,
            status,
            submitted_by,
            submitted_at,
            reviewed_by,
            reviewed_at,
            remarks,
            created_at,
            updated_at
          `,
          [
            property_unit_id,
            currentOwnership.owner_id,
            cleanOwnerName,
            cleanContact,
            ownershipPercentage,
            transferDate,
            submittedBy,
          ]
        );

      const transferRequest =
        requestResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * AUDIT LOG
       * ---------------------------------------------------------------
       */

      await client.query(
        `
        INSERT INTO audit_logs (
          actor_id,
          action,
          entity_type,
          entity_id,
          property_unit_id,
          previous_status,
          new_status,
          remarks,
          metadata
        )

        VALUES (
          $1::uuid,
          $2,
          $3,
          $4::uuid,
          $5::uuid,
          $6,
          $7,
          $8,
          $9::jsonb
        )
        `,
        [
          submittedBy,
          "TRANSFER_REQUEST_SUBMITTED",
          "PROPERTY_TRANSFER_REQUEST",
          transferRequest.id,
          property_unit_id,
          null,
          "PENDING",
          null,

          JSON.stringify({
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

            building_id:
              property.building_id,

            building_name:
              property.building_name,

            current_owner_id:
              currentOwnership.owner_id,

            current_owner_name:
              currentOwnership.owner_name,

            new_owner_name:
              cleanOwnerName,

            new_owner_contact:
              cleanContact,

            ownership_percentage:
              ownershipPercentage,

            transfer_date:
              transferDate,
          }),
        ]
      );

      await client.query("COMMIT");

      /*
       * ---------------------------------------------------------------
       * RESPONSE
       * ---------------------------------------------------------------
       */

      return res.status(201).json({
        status: "ok",

        message:
          "Property transfer request submitted successfully",

        transfer_request:
          transferRequest,

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

          current_owner: {
            id:
              currentOwnership.owner_id,

            name:
              currentOwnership.owner_name,

            contact:
              currentOwnership.owner_contact,

            ownership_percentage:
              Number(
                currentOwnership
                  .ownership_percentage
              ),

            valid_from:
              currentOwnership.valid_from,
          },
        },
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Transfer request submission error:",
        error
      );

      const details =
        error instanceof Error
          ? error.message
          : "Unknown database error";

      return res.status(500).json({
        status: "error",
        message:
          "Failed to submit property transfer request",
        details,
      });
    } finally {
      client.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET TRANSFER REQUESTS
| GET /api/property-transfer-requests
|--------------------------------------------------------------------------
|
| ADMIN / GOVERNMENT_OFFICER
|
| Returns transfer requests for the officer dashboard.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  authenticateToken,
  requireRole(
    "ADMIN",
    "GOVERNMENT_OFFICER"
  ),
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            ptr.id,

            ptr.property_unit_id,
            ptr.current_owner_id,

            ptr.new_owner_name,
            ptr.new_owner_contact,

            ptr.ownership_percentage,
            ptr.transfer_date,

            ptr.status,

            ptr.submitted_by,
            submitter.name AS submitted_by_name,
            submitter.email AS submitted_by_email,

            ptr.reviewed_by,
            reviewer.name AS reviewed_by_name,
            reviewer.email AS reviewed_by_email,

            ptr.submitted_at,
            ptr.reviewed_at,

            ptr.remarks,

            ptr.created_at,
            ptr.updated_at,

            pu.unit_number,
            pu.vertical_property_id,
            pu.parent_ulpin,

            f.floor_number,
            f.floor_label,

            b.id AS building_id,
            b.building_name,

            current_owner.name AS current_owner_name,
            current_owner.contact AS current_owner_contact

          FROM property_transfer_requests ptr

          INNER JOIN property_units pu
            ON pu.id =
              ptr.property_unit_id

          INNER JOIN floors f
            ON f.id = pu.floor_id

          INNER JOIN buildings b
            ON b.id = f.building_id

          INNER JOIN owners current_owner
            ON current_owner.id =
              ptr.current_owner_id

          INNER JOIN users submitter
            ON submitter.id =
              ptr.submitted_by

          LEFT JOIN users reviewer
            ON reviewer.id =
              ptr.reviewed_by

          ORDER BY
            CASE
              WHEN ptr.status = 'PENDING'
                THEN 0
              ELSE 1
            END,

            ptr.created_at DESC
          `
        );

      return res.json({
        status: "ok",
        transfer_requests:
          result.rows,
      });
    } catch (error) {
      console.error(
        "Transfer request list error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Failed to fetch transfer requests",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| APPROVE TRANSFER REQUEST
| POST /api/property-transfer-requests/:id/approve
|--------------------------------------------------------------------------
|
| ADMIN / GOVERNMENT_OFFICER
|
| Approval and ownership transfer happen inside
| ONE database transaction.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/approve",
  authenticateToken,
  requireRole(
    "ADMIN",
    "GOVERNMENT_OFFICER"
  ),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } =
        req.params;

      const {
        remarks,
      } = req.body;

      const reviewerId =
        (req as AuthenticatedRequest).user?.id;

      if (!reviewerId) {
        return res.status(401).json({
          status: "error",
          message:
            "Authenticated user ID not found",
        });
      }

      await client.query("BEGIN");

      /*
       * ---------------------------------------------------------------
       * LOCK REQUEST
       * ---------------------------------------------------------------
       */

      const requestResult =
        await client.query(
          `
          SELECT
            id,
            property_unit_id,
            current_owner_id,

            new_owner_name,
            new_owner_contact,

            ownership_percentage,
            transfer_date,

            status,
            submitted_by,
            remarks

          FROM property_transfer_requests

          WHERE id = $1::uuid

          FOR UPDATE
          `,
          [id]
        );

      if (
        requestResult.rowCount === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          status: "error",
          message:
            "Transfer request not found",
        });
      }

      const request =
        requestResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * CHECK STATUS
       * ---------------------------------------------------------------
       */

      if (
        request.status !==
        "PENDING"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          status: "error",
          message:
            `Transfer request is already ${request.status.toLowerCase()}`,
        });
      }

      /*
       * ---------------------------------------------------------------
       * LOCK CURRENT OWNERSHIP
       * ---------------------------------------------------------------
       */

      const currentOwnershipResult =
        await client.query(
          `
          SELECT
            po.id,
            po.owner_id,

            o.name AS owner_name,
            o.contact AS owner_contact,

            po.ownership_percentage,
            po.valid_from,
            po.valid_to

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

          FOR UPDATE
          `,
          [request.property_unit_id]
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
       * VERIFY REQUEST OWNER
       * ---------------------------------------------------------------
       */

      if (
        currentOwnership.owner_id !==
        request.current_owner_id
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          status: "error",
          message:
            "Transfer request is no longer valid because the current property owner has changed",
        });
      }

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

          WHERE
            pu.id = $1::uuid

          LIMIT 1
          `,
          [request.property_unit_id]
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
       * VALIDATE TRANSFER DATE
       * ---------------------------------------------------------------
       */

      const transferDateObject =
        new Date(
          request.transfer_date
        );

      const currentValidFrom =
        new Date(
          currentOwnership.valid_from
        );

      if (
        Number.isNaN(
          transferDateObject.getTime()
        ) ||
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
       * PREVENT SAME OWNER
       * ---------------------------------------------------------------
       */

      const sameName =
        currentOwnership.owner_name
          .trim()
          .toLowerCase() ===
        request.new_owner_name
          .trim()
          .toLowerCase();

      const sameContact =
        (
          currentOwnership.owner_contact ??
          null
        ) ===
        (
          request.new_owner_contact ??
          null
        );

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

        SET
          valid_to =
            $1::date

        WHERE
          id = $2::uuid
          AND valid_to IS NULL
        `,
        [
          request.transfer_date,
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

      if (
        request.new_owner_contact
      ) {
        const existingOwnerResult =
          await client.query(
            `
            SELECT
              id

            FROM owners

            WHERE
              LOWER(name) =
                LOWER($1)
              AND contact = $2

            LIMIT 1
            `,
            [
              request.new_owner_name
                .trim(),

              request.new_owner_contact
                .trim(),
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
       * CREATE NEW OWNER
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
              request.new_owner_name
                .trim(),

              request.new_owner_contact
                ? request.new_owner_contact
                    .trim()
                : null,
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
            request.property_unit_id,
            newOwnerId,
            Number(
              request.ownership_percentage
            ),
            request.transfer_date,
          ]
        );

      /*
       * ---------------------------------------------------------------
       * UPDATE TRANSFER REQUEST
       * ---------------------------------------------------------------
       */

      const cleanRemarks =
        remarks
          ? String(
              remarks
            ).trim()
          : request.remarks;

      const updatedRequestResult =
        await client.query(
          `
          UPDATE property_transfer_requests

          SET
            status = 'APPROVED',

            reviewed_by =
              $1::uuid,

            reviewed_at =
              NOW(),

            remarks =
              $2,

            updated_at =
              NOW()

          WHERE
            id = $3::uuid

          RETURNING
            id,
            property_unit_id,
            current_owner_id,
            new_owner_name,
            new_owner_contact,
            ownership_percentage,
            transfer_date,
            status,
            submitted_by,
            submitted_at,
            reviewed_by,
            reviewed_at,
            remarks,
            created_at,
            updated_at
          `,
          [
            reviewerId,
            cleanRemarks,
            id,
          ]
        );

      const updatedRequest =
        updatedRequestResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * AUDIT LOG
       * ---------------------------------------------------------------
       */

      await client.query(
        `
        INSERT INTO audit_logs (
          actor_id,
          action,
          entity_type,
          entity_id,
          property_unit_id,
          previous_status,
          new_status,
          remarks,
          metadata
        )

        VALUES (
          $1::uuid,
          $2,
          $3,
          $4::uuid,
          $5::uuid,
          $6,
          $7,
          $8,
          $9::jsonb
        )
        `,
        [
          reviewerId,
          "TRANSFER_REQUEST_APPROVED",
          "PROPERTY_TRANSFER_REQUEST",
          id,
          request.property_unit_id,
          "PENDING",
          "APPROVED",
          cleanRemarks,

          JSON.stringify({
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

            building_id:
              property.building_id,

            building_name:
              property.building_name,

            previous_owner_id:
              currentOwnership.owner_id,

            previous_owner_name:
              currentOwnership.owner_name,

            previous_ownership_id:
              currentOwnership.id,

            new_owner_id:
              newOwnerId,

            new_owner_name:
              request.new_owner_name,

            new_owner_contact:
              request.new_owner_contact,

            new_ownership_id:
              newOwnershipResult.rows[0]
                .id,

            ownership_percentage:
              Number(
                request.ownership_percentage
              ),

            transfer_date:
              request.transfer_date,
          }),
        ]
      );

      await client.query("COMMIT");

      /*
       * ---------------------------------------------------------------
       * RESPONSE
       * ---------------------------------------------------------------
       */

      return res.json({
        status: "ok",

        message:
          "Property transfer request approved and ownership transferred successfully",

        transfer_request:
          updatedRequest,

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

        previous_owner: {
          ownership_id:
            currentOwnership.id,

          owner_id:
            currentOwnership.owner_id,

          name:
            currentOwnership.owner_name,

          contact:
            currentOwnership.owner_contact,

          ownership_percentage:
            Number(
              currentOwnership
                .ownership_percentage
            ),

          valid_from:
            currentOwnership.valid_from,

          valid_to:
            request.transfer_date,
        },

        current_owner: {
          ownership_id:
            newOwnershipResult
              .rows[0].id,

          owner_id:
            newOwnerId,

          name:
            request.new_owner_name,

          contact:
            request.new_owner_contact,

          ownership_percentage:
            Number(
              request.ownership_percentage
            ),

          valid_from:
            request.transfer_date,

          valid_to: null,
        },

        transfer: {
          transfer_date:
            request.transfer_date,
        },
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Transfer request approval error:",
        error
      );

      const details =
        error instanceof Error
          ? error.message
          : "Unknown database error";

      return res.status(500).json({
        status: "error",

        message:
          "Failed to approve transfer request",

        details,
      });
    } finally {
      client.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| REJECT TRANSFER REQUEST
| POST /api/property-transfer-requests/:id/reject
|--------------------------------------------------------------------------
|
| ADMIN / GOVERNMENT_OFFICER
|
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/reject",
  authenticateToken,
  requireRole(
    "ADMIN",
    "GOVERNMENT_OFFICER"
  ),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } =
        req.params;

      const {
        remarks,
      } = req.body;

      const reviewerId =
        (req as AuthenticatedRequest).user?.id;

      if (!reviewerId) {
        return res.status(401).json({
          status: "error",
          message:
            "Authenticated user ID not found",
        });
      }

      await client.query("BEGIN");

      /*
       * ---------------------------------------------------------------
       * LOCK REQUEST
       * ---------------------------------------------------------------
       */

      const requestResult =
        await client.query(
          `
          SELECT
            ptr.id,
            ptr.property_unit_id,
            ptr.current_owner_id,

            ptr.new_owner_name,
            ptr.new_owner_contact,

            ptr.ownership_percentage,
            ptr.transfer_date,

            ptr.status,
            ptr.submitted_by,
            ptr.remarks,

            pu.vertical_property_id,
            pu.parent_ulpin,
            pu.unit_number,

            f.floor_number,
            f.floor_label,

            b.id AS building_id,
            b.building_name

          FROM property_transfer_requests ptr

          INNER JOIN property_units pu
            ON pu.id =
              ptr.property_unit_id

          INNER JOIN floors f
            ON f.id =
              pu.floor_id

          INNER JOIN buildings b
            ON b.id =
              f.building_id

          WHERE
            ptr.id = $1::uuid

          FOR UPDATE
          `,
          [id]
        );

      if (
        requestResult.rowCount === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          status: "error",
          message:
            "Transfer request not found",
        });
      }

      const request =
        requestResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * CHECK STATUS
       * ---------------------------------------------------------------
       */

      if (
        request.status !==
        "PENDING"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          status: "error",
          message:
            `Transfer request is already ${request.status.toLowerCase()}`,
        });
      }

      const cleanRemarks =
        remarks
          ? String(
              remarks
            ).trim()
          : request.remarks;

      /*
       * ---------------------------------------------------------------
       * REJECT REQUEST
       * ---------------------------------------------------------------
       */

      const updatedResult =
        await client.query(
          `
          UPDATE property_transfer_requests

          SET
            status = 'REJECTED',

            reviewed_by =
              $1::uuid,

            reviewed_at =
              NOW(),

            remarks =
              $2,

            updated_at =
              NOW()

          WHERE
            id = $3::uuid

          RETURNING
            id,
            property_unit_id,
            current_owner_id,
            new_owner_name,
            new_owner_contact,
            ownership_percentage,
            transfer_date,
            status,
            submitted_by,
            submitted_at,
            reviewed_by,
            reviewed_at,
            remarks,
            created_at,
            updated_at
          `,
          [
            reviewerId,
            cleanRemarks,
            id,
          ]
        );

      const updatedRequest =
        updatedResult.rows[0];

      /*
       * ---------------------------------------------------------------
       * AUDIT LOG
       * ---------------------------------------------------------------
       */

      await client.query(
        `
        INSERT INTO audit_logs (
          actor_id,
          action,
          entity_type,
          entity_id,
          property_unit_id,
          previous_status,
          new_status,
          remarks,
          metadata
        )

        VALUES (
          $1::uuid,
          $2,
          $3,
          $4::uuid,
          $5::uuid,
          $6,
          $7,
          $8,
          $9::jsonb
        )
        `,
        [
          reviewerId,
          "TRANSFER_REQUEST_REJECTED",
          "PROPERTY_TRANSFER_REQUEST",
          id,
          request.property_unit_id,
          "PENDING",
          "REJECTED",
          cleanRemarks,

          JSON.stringify({
            vertical_property_id:
              request.vertical_property_id,

            parent_ulpin:
              request.parent_ulpin,

            unit_number:
              request.unit_number,

            floor_number:
              Number(
                request.floor_number
              ),

            floor_label:
              request.floor_label,

            building_id:
              request.building_id,

            building_name:
              request.building_name,

            current_owner_id:
              request.current_owner_id,

            new_owner_name:
              request.new_owner_name,

            new_owner_contact:
              request.new_owner_contact,

            ownership_percentage:
              Number(
                request.ownership_percentage
              ),

            transfer_date:
              request.transfer_date,
          }),
        ]
      );

      await client.query("COMMIT");

      return res.json({
        status: "ok",

        message:
          "Property transfer request rejected successfully",

        transfer_request:
          updatedRequest,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Transfer request rejection error:",
        error
      );

      const details =
        error instanceof Error
          ? error.message
          : "Unknown database error";

      return res.status(500).json({
        status: "error",

        message:
          "Failed to reject transfer request",

        details,
      });
    } finally {
      client.release();
    }
  }
);

export default router;