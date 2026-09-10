import {
    Router,
    type Request,
} from "express";

import { pool } from "../db/pool.js";

import {
    authenticateToken,
    requireRole,
} from "../middleware/authMiddleware.js";

const router = Router();

type AuthenticatedRequest =
    Request & {
        user?: {
            id: string;
            email?: string;
            role?: string;
        };
    };

/*
|--------------------------------------------------------------------------
| CREATE REGISTRATION REQUEST
| POST /api/property-registrations
|--------------------------------------------------------------------------
*/

router.post(
    "/",
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
                owner_id,
                ownership_id,
                remarks,
            } = req.body;

            const submittedBy =
                (req as AuthenticatedRequest).user?.id;

            if (!property_unit_id) {
                return res.status(400).json({
                    status: "error",
                    message:
                        "property_unit_id is required",
                });
            }

            if (!submittedBy) {
                return res.status(401).json({
                    status: "error",
                    message:
                        "Authenticated user ID not found",
                });
            }

            /*
             * A registration that is intended to become an
             * approved property record must identify the owner
             * and the corresponding ownership record.
             *
             * We require them together so that we never create
             * an inconsistent registration such as:
             *
             * owner_id = NULL
             * ownership_id = NULL
             */

            if (
                (owner_id && !ownership_id) ||
                (!owner_id && ownership_id)
            ) {
                return res.status(400).json({
                    status: "error",
                    message:
                        "owner_id and ownership_id must be provided together",
                });
            }

            await client.query("BEGIN");

            /*
             * ---------------------------------------------------------------
             * CHECK PROPERTY UNIT
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
             * CHECK OWNER
             * ---------------------------------------------------------------
             */

            let owner:
                | {
                    id: string;
                    name: string;
                    contact: string | null;
                }
                | null = null;

            if (owner_id) {
                const ownerResult =
                    await client.query(
                        `
                        SELECT
                            id,
                            name,
                            contact

                        FROM owners

                        WHERE id = $1::uuid

                        LIMIT 1
                        `,
                        [owner_id]
                    );

                if (
                    ownerResult.rowCount === 0
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(404).json({
                        status: "error",
                        message:
                            "Owner not found",
                    });
                }

                owner =
                    ownerResult.rows[0];
            }

            /*
             * ---------------------------------------------------------------
             * CHECK OWNERSHIP RECORD
             * ---------------------------------------------------------------
             */

            let ownership:
                | {
                    id: string;
                    property_unit_id: string;
                    owner_id: string;
                    ownership_percentage: string | number;
                    valid_from: string;
                    valid_to: string | null;
                }
                | null = null;

            if (ownership_id) {
                const ownershipResult =
                    await client.query(
                        `
                        SELECT
                            id,
                            property_unit_id,
                            owner_id,
                            ownership_percentage,
                            valid_from,
                            valid_to

                        FROM property_ownership

                        WHERE id = $1::uuid
                          AND property_unit_id = $2::uuid

                        LIMIT 1
                        `,
                        [
                            ownership_id,
                            property_unit_id,
                        ]
                    );

                if (
                    ownershipResult.rowCount === 0
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(404).json({
                        status: "error",
                        message:
                            "Ownership record not found for this property",
                    });
                }

                ownership =
                    ownershipResult.rows[0];

                /*
                 * Owner and ownership must match.
                 */

                if (
                    !ownership ||
                    ownership.owner_id !== owner_id
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(409).json({
                        status: "error",
                        message:
                            "Owner does not match the selected ownership record",
                    });
                }

                /*
                 * Registration should point to the currently
                 * active ownership record.
                 */

                if (
                    !ownership ||
                    ownership.valid_to !== null
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(409).json({
                        status: "error",
                        message:
                            "The selected ownership record is no longer active",
                    });
                }
            }

            /*
             * ---------------------------------------------------------------
             * PREVENT DUPLICATE PENDING REQUEST
             * ---------------------------------------------------------------
             */

            const pendingResult =
                await client.query(
                    `
                    SELECT
                        id

                    FROM property_registrations

                    WHERE property_unit_id = $1::uuid
                      AND status = 'PENDING'

                    LIMIT 1
                    `,
                    [property_unit_id]
                );

            if (
                pendingResult.rowCount !== 0
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(409).json({
                    status: "error",
                    message:
                        "A pending registration request already exists for this property",
                });
            }

            /*
             * ---------------------------------------------------------------
             * CREATE REGISTRATION
             * ---------------------------------------------------------------
             */

            const registrationResult =
                await client.query(
                    `
                    INSERT INTO property_registrations (
                        property_unit_id,
                        owner_id,
                        ownership_id,
                        status,
                        submitted_by,
                        submitted_at,
                        remarks
                    )

                    VALUES (
                        $1::uuid,
                        $2::uuid,
                        $3::uuid,
                        'PENDING',
                        $4::uuid,
                        NOW(),
                        $5
                    )

                    RETURNING
                        id,
                        property_unit_id,
                        owner_id,
                        ownership_id,
                        status,
                        registration_number,
                        submitted_by,
                        reviewed_by,
                        submitted_at,
                        reviewed_at,
                        remarks,
                        created_at,
                        updated_at
                    `,
                    [
                        property_unit_id,
                        owner_id ?? null,
                        ownership_id ?? null,
                        submittedBy,
                        remarks
                            ? String(
                                remarks
                            ).trim()
                            : null,
                    ]
                );

            const registration =
                registrationResult.rows[0];

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
                    "REGISTRATION_SUBMITTED",
                    "PROPERTY_REGISTRATION",
                    registration.id,
                    property_unit_id,
                    null,
                    "PENDING",
                    remarks
                        ? String(
                            remarks
                        ).trim()
                        : null,

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

                        owner_id:
                            owner_id ?? null,

                        owner_name:
                            owner?.name ?? null,

                        owner_contact:
                            owner?.contact ?? null,

                        ownership_id:
                            ownership_id ?? null,

                        ownership_percentage:
                            ownership
                                ?.ownership_percentage ??
                            null,
                    }),
                ]
            );

            await client.query(
                "COMMIT"
            );

            return res.status(201).json({
                status: "ok",

                message:
                    "Property registration request submitted successfully",

                registration,

                property: {
                    id:
                        property.id,

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

                    owner: owner
                        ? {
                            id:
                                owner.id,

                            name:
                                owner.name,

                            contact:
                                owner.contact,
                        }
                        : null,

                    ownership: ownership
                        ? {
                            id:
                                ownership.id,

                            percentage:
                                ownership.ownership_percentage,

                            valid_from:
                                ownership.valid_from,

                            valid_to:
                                ownership.valid_to,
                        }
                        : null,
                },
            });
        } catch (error) {
            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Registration request error:",
                error
            );

            const details =
                error instanceof Error
                    ? error.message
                    : "Unknown error";

            return res.status(500).json({
                status: "error",

                message:
                    "Failed to create registration request",

                details,
            });
        } finally {
            client.release();
        }
    }
);

/*
|--------------------------------------------------------------------------
| GET REGISTRATION REQUESTS
| GET /api/property-registrations
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
                        pr.id,

                        pr.property_unit_id,

                        pr.owner_id,
                        o.name AS owner_name,
                        o.contact AS owner_contact,

                        pr.ownership_id,
                        po.ownership_percentage,

                        pr.status,
                        pr.registration_number,

                        pr.submitted_by,
                        submitter.name AS submitted_by_name,

                        pr.reviewed_by,
                        reviewer.name AS reviewed_by_name,

                        pr.submitted_at,
                        pr.reviewed_at,

                        pr.remarks,

                        pr.created_at,
                        pr.updated_at,

                        pu.unit_number,
                        pu.vertical_property_id,
                        pu.parent_ulpin,

                        f.floor_number,
                        f.floor_label,

                        b.id AS building_id,
                        b.building_name

                    FROM property_registrations pr

                    INNER JOIN property_units pu
                        ON pu.id = pr.property_unit_id

                    INNER JOIN floors f
                        ON f.id = pu.floor_id

                    INNER JOIN buildings b
                        ON b.id = f.building_id

                    LEFT JOIN owners o
                        ON o.id = pr.owner_id

                    LEFT JOIN property_ownership po
                        ON po.id = pr.ownership_id

                    LEFT JOIN users submitter
                        ON submitter.id = pr.submitted_by

                    LEFT JOIN users reviewer
                        ON reviewer.id = pr.reviewed_by

                    ORDER BY
                        CASE
                            WHEN pr.status = 'PENDING'
                                THEN 1

                            WHEN pr.status = 'APPROVED'
                                THEN 2

                            ELSE 3
                        END,

                        pr.submitted_at DESC
                    `
                );

            return res.json({
                status: "ok",

                registrations:
                    result.rows,
            });
        } catch (error) {
            console.error(
                "Registration list error:",
                error
            );

            return res.status(500).json({
                status: "error",

                message:
                    "Failed to fetch registration requests",
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| APPROVE REGISTRATION
| POST /api/property-registrations/:id/approve
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
            const {
                id,
            } = req.params;

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
             * LOCK REGISTRATION
             * ---------------------------------------------------------------
             */

            const registrationLockResult =
                await client.query(
                    `
                    SELECT
                        id,
                        property_unit_id,
                        owner_id,
                        ownership_id,
                        status

                    FROM property_registrations

                    WHERE id = $1::uuid

                    FOR UPDATE
                    `,
                    [id]
                );

            if (
                registrationLockResult.rowCount ===
                0
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    status: "error",

                    message:
                        "Registration request not found",
                });
            }

            const registration =
                registrationLockResult.rows[0];

            /*
             * ---------------------------------------------------------------
             * CHECK STATUS
             * ---------------------------------------------------------------
             */

            if (
                registration.status !==
                "PENDING"
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(409).json({
                    status: "error",

                    message:
                        `Registration request is already ${registration.status.toLowerCase()}`,
                });
            }

            /*
             * ---------------------------------------------------------------
             * REQUIRE OWNERSHIP FOR APPROVAL
             * ---------------------------------------------------------------
             */

            if (
                !registration.owner_id ||
                !registration.ownership_id
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(409).json({
                    status: "error",

                    message:
                        "Registration cannot be approved until an owner and active ownership record are associated with the property",
                });
            }

            /*
             * ---------------------------------------------------------------
             * LOAD PROPERTY + OWNER + OWNERSHIP
             * ---------------------------------------------------------------
             */

            const propertyResult =
                await client.query(
                    `
                    SELECT
                        pu.unit_number,
                        pu.vertical_property_id,
                        pu.parent_ulpin,

                        f.floor_number,
                        f.floor_label,

                        b.id AS building_id,
                        b.building_name,

                        o.id AS owner_id,
                        o.name AS owner_name,
                        o.contact AS owner_contact,

                        po.id AS ownership_id,
                        po.ownership_percentage,
                        po.valid_from,
                        po.valid_to

                    FROM property_units pu

                    INNER JOIN floors f
                        ON f.id = pu.floor_id

                    INNER JOIN buildings b
                        ON b.id = f.building_id

                    INNER JOIN owners o
                        ON o.id = $2::uuid

                    INNER JOIN property_ownership po
                        ON po.id = $3::uuid
                       AND po.property_unit_id = pu.id
                       AND po.owner_id = o.id

                    WHERE pu.id = $1::uuid

                    LIMIT 1
                    `,
                    [
                        registration.property_unit_id,
                        registration.owner_id,
                        registration.ownership_id,
                    ]
                );

            if (
                propertyResult.rowCount === 0
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(409).json({
                    status: "error",

                    message:
                        "Owner and ownership record are not valid for this property",
                });
            }

            const property =
                propertyResult.rows[0];

            /*
             * ---------------------------------------------------------------
             * VERIFY OWNERSHIP IS ACTIVE
             * ---------------------------------------------------------------
             */

            if (
                property.valid_to !== null
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(409).json({
                    status: "error",

                    message:
                        "The ownership record associated with this registration is no longer active",
                });
            }

            /*
             * ---------------------------------------------------------------
             * GENERATE REGISTRATION NUMBER
             * ---------------------------------------------------------------
             */

            const numberResult =
                await client.query(
                    `
                    SELECT
                        COUNT(*) + 1 AS next_number

                    FROM property_registrations

                    WHERE status = 'APPROVED'
                    `
                );

            const nextNumber =
                Number(
                    numberResult.rows[0]
                        .next_number
                );

            const registrationNumber =
                `REG-${new Date()
                    .getFullYear()}-${String(
                        nextNumber
                    ).padStart(6, "0")}`;

            /*
             * ---------------------------------------------------------------
             * APPROVE REGISTRATION
             * ---------------------------------------------------------------
             */

            const updatedResult =
                await client.query(
                    `
                    UPDATE property_registrations

                    SET
                        status = 'APPROVED',

                        registration_number =
                            $1,

                        reviewed_by =
                            $2::uuid,

                        reviewed_at =
                            NOW(),

                        remarks =
                            COALESCE(
                                NULLIF($3, ''),
                                remarks
                            ),

                        updated_at =
                            NOW()

                    WHERE id =
                        $4::uuid

                    RETURNING
                        id,
                        property_unit_id,
                        owner_id,
                        ownership_id,
                        status,
                        registration_number,
                        submitted_by,
                        reviewed_by,
                        submitted_at,
                        reviewed_at,
                        remarks,
                        created_at,
                        updated_at
                    `,
                    [
                        registrationNumber,
                        reviewerId,

                        remarks
                            ? String(
                                remarks
                            ).trim()
                            : null,

                        id,
                    ]
                );

            const updatedRegistration =
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
                    "REGISTRATION_APPROVED",
                    "PROPERTY_REGISTRATION",
                    id,
                    registration.property_unit_id,
                    "PENDING",
                    "APPROVED",

                    remarks
                        ? String(
                            remarks
                        ).trim()
                        : updatedRegistration.remarks,

                    JSON.stringify({
                        registration_number:
                            registrationNumber,

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

                        owner_id:
                            property.owner_id,

                        owner_name:
                            property.owner_name,

                        owner_contact:
                            property.owner_contact,

                        ownership_id:
                            property.ownership_id,

                        ownership_percentage:
                            property.ownership_percentage,

                        ownership_valid_from:
                            property.valid_from,

                        ownership_valid_to:
                            property.valid_to,
                    }),
                ]
            );

            /*
             * ---------------------------------------------------------------
             * COMMIT
             * ---------------------------------------------------------------
             */

            await client.query(
                "COMMIT"
            );

            return res.json({
                status: "ok",

                message:
                    "Property registration approved successfully",

                registration:
                    updatedRegistration,

                property: {
                    unit_number:
                        property.unit_number,

                    vertical_property_id:
                        property.vertical_property_id,

                    parent_ulpin:
                        property.parent_ulpin,

                    owner: {
                        id:
                            property.owner_id,

                        name:
                            property.owner_name,

                        contact:
                            property.owner_contact,
                    },

                    ownership: {
                        id:
                            property.ownership_id,

                        percentage:
                            property.ownership_percentage,

                        valid_from:
                            property.valid_from,

                        valid_to:
                            property.valid_to,
                    },

                    building: {
                        id:
                            property.building_id,

                        name:
                            property.building_name,
                    },
                },
            });
        } catch (error) {
            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Registration approval error:",
                error
            );

            const details =
                error instanceof Error
                    ? error.message
                    : "Unknown error";

            return res.status(500).json({
                status: "error",

                message:
                    "Failed to approve registration",

                details,
            });
        } finally {
            client.release();
        }
    }
);

/*
|--------------------------------------------------------------------------
| REJECT REGISTRATION
| POST /api/property-registrations/:id/reject
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
            const {
                id,
            } = req.params;

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

            const cleanRemarks =
                remarks
                    ? String(
                        remarks
                    ).trim()
                    : "";

            if (!cleanRemarks) {
                return res.status(400).json({
                    status: "error",

                    message:
                        "Remarks are required when rejecting a registration",
                });
            }

            await client.query("BEGIN");

            /*
             * ---------------------------------------------------------------
             * LOCK REGISTRATION
             * ---------------------------------------------------------------
             */

            const registrationResult =
                await client.query(
                    `
                    SELECT
                        id,
                        status,
                        property_unit_id,
                        owner_id,
                        ownership_id

                    FROM property_registrations

                    WHERE id = $1::uuid

                    FOR UPDATE
                    `,
                    [id]
                );

            if (
                registrationResult.rowCount ===
                0
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    status: "error",

                    message:
                        "Registration request not found",
                });
            }

            const registration =
                registrationResult.rows[0];

            /*
             * ---------------------------------------------------------------
             * CHECK STATUS
             * ---------------------------------------------------------------
             */

            if (
                registration.status !==
                "PENDING"
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(409).json({
                    status: "error",

                    message:
                        `Registration request is already ${registration.status.toLowerCase()}`,
                });
            }

            /*
             * ---------------------------------------------------------------
             * LOAD PROPERTY DETAILS FOR AUDIT
             * ---------------------------------------------------------------
             */

            const propertyResult =
                await client.query(
                    `
                    SELECT
                        pu.unit_number,
                        pu.vertical_property_id,
                        pu.parent_ulpin,

                        f.floor_number,
                        f.floor_label,

                        b.id AS building_id,
                        b.building_name,

                        o.name AS owner_name,
                        o.contact AS owner_contact

                    FROM property_units pu

                    INNER JOIN floors f
                        ON f.id = pu.floor_id

                    INNER JOIN buildings b
                        ON b.id = f.building_id

                    LEFT JOIN owners o
                        ON o.id = $2::uuid

                    WHERE pu.id = $1::uuid

                    LIMIT 1
                    `,
                    [
                        registration.property_unit_id,
                        registration.owner_id,
                    ]
                );

            if (
                propertyResult.rowCount ===
                0
            ) {
                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    status: "error",

                    message:
                        "Property unit associated with registration was not found",
                });
            }

            const property =
                propertyResult.rows[0];

            /*
             * ---------------------------------------------------------------
             * REJECT
             * ---------------------------------------------------------------
             */

            const updatedResult =
                await client.query(
                    `
                    UPDATE property_registrations

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

                    WHERE id =
                        $3::uuid

                    RETURNING
                        id,
                        property_unit_id,
                        owner_id,
                        ownership_id,
                        status,
                        registration_number,
                        submitted_by,
                        reviewed_by,
                        submitted_at,
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

            const updatedRegistration =
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
                    "REGISTRATION_REJECTED",
                    "PROPERTY_REGISTRATION",
                    id,
                    registration.property_unit_id,
                    "PENDING",
                    "REJECTED",
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

                        owner_id:
                            registration.owner_id,

                        owner_name:
                            property.owner_name,

                        ownership_id:
                            registration.ownership_id,
                    }),
                ]
            );

            /*
             * ---------------------------------------------------------------
             * COMMIT
             * ---------------------------------------------------------------
             */

            await client.query(
                "COMMIT"
            );

            return res.json({
                status: "ok",

                message:
                    "Property registration rejected successfully",

                registration:
                    updatedRegistration,
            });
        } catch (error) {
            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Registration rejection error:",
                error
            );

            const details =
                error instanceof Error
                    ? error.message
                    : "Unknown error";

            return res.status(500).json({
                status: "error",

                message:
                    "Failed to reject registration",

                details,
            });
        } finally {
            client.release();
        }
    }
);

export default router;