import {
    Router,
    type Request,
    type Response,
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
|
| CITIZEN:
|   - Can submit a first-time property registration.
|   - Owner name must match the authenticated citizen account.
|   - Backend creates/reuses the owner.
|   - Backend creates the active ownership record.
|   - Registration is created with PENDING status.
|
| ADMIN / GOVERNMENT_OFFICER:
|   - Can submit using an existing owner + ownership record.
|
*/

router.post(
    "/",
    authenticateToken,
    requireRole(
        "ADMIN",
        "GOVERNMENT_OFFICER",
        "CITIZEN"
    ),
    async (req, res) => {
        const client = await pool.connect();

        try {
            const {
                property_unit_id,
                owner_id,
                ownership_id,
                owner_name,
                owner_contact,
                ownership_percentage,
                remarks,
            } = req.body;

            const authenticatedUser =
                (req as AuthenticatedRequest).user;

            const submittedBy =
                authenticatedUser?.id;

            const submittedByRole =
                authenticatedUser?.role;

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
             * ---------------------------------------------------------------
             * BEGIN TRANSACTION
             * ---------------------------------------------------------------
             */

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

            if (propertyResult.rowCount === 0) {
                await client.query("ROLLBACK");

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

            if (pendingResult.rowCount !== 0) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    status: "error",
                    message:
                        "A pending registration request already exists for this property",
                });
            }

            /*
             * ---------------------------------------------------------------
             * CHECK EXISTING ACTIVE OWNERSHIP
             * ---------------------------------------------------------------
             */

            const activeOwnershipResult =
                await client.query(
                    `
                    SELECT
                        po.id,
                        po.owner_id,
                        o.name AS owner_name

                    FROM property_ownership po

                    INNER JOIN owners o
                        ON o.id = po.owner_id

                    WHERE po.property_unit_id = $1::uuid
                      AND po.valid_to IS NULL

                    LIMIT 1
                    `,
                    [property_unit_id]
                );

            /*
             * ===============================================================
             * CITIZEN REGISTRATION FLOW
             * ===============================================================
             */

            if (
                submittedByRole ===
                "CITIZEN"
            ) {
                /*
                 * A citizen can only submit a first-time registration
                 * when the property currently has no active owner.
                 */

                if (
                    activeOwnershipResult.rowCount !== 0
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(409).json({
                        status: "error",
                        message:
                            "This property already has an active owner and cannot be submitted as a new registration",
                    });
                }

                const cleanOwnerName =
                    owner_name
                        ? String(
                            owner_name
                        ).trim()
                        : "";

                const cleanOwnerContact =
                    owner_contact
                        ? String(
                            owner_contact
                        ).trim()
                        : "";

                const cleanRemarks =
                    remarks
                        ? String(
                            remarks
                        ).trim()
                        : null;

                /*
                 * -----------------------------------------------------------
                 * VALIDATE OWNER NAME
                 * -----------------------------------------------------------
                 */

                if (!cleanOwnerName) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(400).json({
                        status: "error",
                        message:
                            "owner_name is required for citizen registration",
                    });
                }

                /*
                 * -----------------------------------------------------------
                 * LOAD AUTHENTICATED CITIZEN
                 * -----------------------------------------------------------
                 */

                const userResult =
                    await client.query(
                        `
                        SELECT
                            id,
                            name,
                            email

                        FROM users

                        WHERE id = $1::uuid
                          AND is_active = TRUE

                        LIMIT 1
                        `,
                        [submittedBy]
                    );

                if (userResult.rowCount === 0) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(404).json({
                        status: "error",
                        message:
                            "Citizen account not found",
                    });
                }

                const citizen =
                    userResult.rows[0];

                /*
                 * Citizen cannot submit somebody else's name.
                 */

                if (
                    citizen.name
                        .trim()
                        .toLowerCase() !==
                    cleanOwnerName
                        .toLowerCase()
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(403).json({
                        status: "error",
                        message:
                            "Owner name must match the authenticated citizen account name",
                    });
                }

                /*
                 * -----------------------------------------------------------
                 * VALIDATE CONTACT
                 * -----------------------------------------------------------
                 */

                if (!cleanOwnerContact) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(400).json({
                        status: "error",
                        message:
                            "owner_contact is required for citizen registration",
                    });
                }

                /*
                 * -----------------------------------------------------------
                 * VALIDATE OWNERSHIP PERCENTAGE
                 * -----------------------------------------------------------
                 */

                const percentage =
                    Number(
                        ownership_percentage
                    );

                if (
                    !Number.isFinite(
                        percentage
                    ) ||
                    percentage <= 0 ||
                    percentage > 100
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(400).json({
                        status: "error",
                        message:
                            "ownership_percentage must be between 0 and 100",
                    });
                }

                /*
                 * -----------------------------------------------------------
                 * FIND OR CREATE OWNER
                 * -----------------------------------------------------------
                 */

                let ownerResult =
                    await client.query(
                        `
                        SELECT
                            id,
                            name,
                            contact

                        FROM owners

                        WHERE LOWER(name) =
                              LOWER($1)
                          AND contact = $2

                        LIMIT 1
                        `,
                        [
                            cleanOwnerName,
                            cleanOwnerContact,
                        ]
                    );

                let owner;

                if (
                    ownerResult.rowCount === 0
                ) {
                    ownerResult =
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
                                contact
                            `,
                            [
                                cleanOwnerName,
                                cleanOwnerContact,
                            ]
                        );
                }

                owner =
                    ownerResult.rows[0];

                /*
                 * -----------------------------------------------------------
                 * CREATE OWNERSHIP RECORD
                 * -----------------------------------------------------------
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
                            $3,
                            CURRENT_DATE,
                            NULL
                        )

                        RETURNING
                            id,
                            property_unit_id,
                            owner_id,
                            ownership_percentage,
                            valid_from,
                            valid_to
                        `,
                        [
                            property_unit_id,
                            owner.id,
                            percentage,
                        ]
                    );

                const ownership =
                    ownershipResult.rows[0];

                /*
                 * -----------------------------------------------------------
                 * CREATE PENDING REGISTRATION
                 * -----------------------------------------------------------
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
                            owner.id,
                            ownership.id,
                            submittedBy,
                            cleanRemarks,
                        ]
                    );

                const registration =
                    registrationResult.rows[0];

                /*
                 * -----------------------------------------------------------
                 * AUDIT LOG
                 * -----------------------------------------------------------
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
                        "CITIZEN_REGISTRATION_SUBMITTED",
                        "PROPERTY_REGISTRATION",
                        registration.id,
                        property_unit_id,
                        null,
                        "PENDING",
                        cleanRemarks,

                        JSON.stringify({
                            submitted_by_role:
                                submittedByRole,

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
                                owner.id,

                            owner_name:
                                owner.name,

                            owner_contact:
                                owner.contact,

                            ownership_id:
                                ownership.id,

                            ownership_percentage:
                                ownership.ownership_percentage,

                            ownership_valid_from:
                                ownership.valid_from,
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

                        owner: {
                            id:
                                owner.id,

                            name:
                                owner.name,

                            contact:
                                owner.contact,
                        },

                        ownership: {
                            id:
                                ownership.id,

                            percentage:
                                ownership.ownership_percentage,

                            valid_from:
                                ownership.valid_from,

                            valid_to:
                                ownership.valid_to,
                        },
                    },
                });
            }

            /*
             * ===============================================================
             * ADMIN / GOVERNMENT OFFICER FLOW
             * ===============================================================
             */

            if (
                submittedByRole ===
                    "ADMIN" ||
                submittedByRole ===
                    "GOVERNMENT_OFFICER"
            ) {
                /*
                 * Existing officer/admin submissions continue to use
                 * an already-created owner and ownership record.
                 */

                if (
                    (owner_id &&
                        !ownership_id) ||
                    (!owner_id &&
                        ownership_id)
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(400).json({
                        status: "error",
                        message:
                            "owner_id and ownership_id must be provided together",
                    });
                }

                if (
                    !owner_id ||
                    !ownership_id
                ) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(400).json({
                        status: "error",
                        message:
                            "owner_id and ownership_id are required for officer/admin registration",
                    });
                }

                /*
                 * -----------------------------------------------------------
                 * CHECK OWNER
                 * -----------------------------------------------------------
                 */

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

                if (ownerResult.rowCount === 0) {
                    await client.query(
                        "ROLLBACK"
                    );

                    return res.status(404).json({
                        status: "error",
                        message:
                            "Owner not found",
                    });
                }

                const owner =
                    ownerResult.rows[0];

                /*
                 * -----------------------------------------------------------
                 * CHECK OWNERSHIP
                 * -----------------------------------------------------------
                 */

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
                    ownershipResult.rowCount ===
                    0
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

                const ownership =
                    ownershipResult.rows[0];

                if (
                    ownership.owner_id !==
                    owner_id
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

                if (
                    ownership.valid_to !==
                    null
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

                /*
                 * -----------------------------------------------------------
                 * CREATE REGISTRATION
                 * -----------------------------------------------------------
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
                            owner_id,
                            ownership_id,
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
                 * -----------------------------------------------------------
                 * AUDIT LOG
                 * -----------------------------------------------------------
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
                            submitted_by_role:
                                submittedByRole,

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
                                owner.id,

                            owner_name:
                                owner.name,

                            owner_contact:
                                owner.contact,

                            ownership_id:
                                ownership.id,

                            ownership_percentage:
                                ownership.ownership_percentage,
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

                        owner: {
                            id:
                                owner.id,

                            name:
                                owner.name,

                            contact:
                                owner.contact,
                        },

                        ownership: {
                            id:
                                ownership.id,

                            percentage:
                                ownership.ownership_percentage,

                            valid_from:
                                ownership.valid_from,

                            valid_to:
                                ownership.valid_to,
                        },
                    },
                });
            }

            /*
             * This should normally be unreachable because requireRole()
             * already validates the role.
             */

            await client.query(
                "ROLLBACK"
            );

            return res.status(403).json({
                status: "error",
                message:
                    "This role cannot submit property registrations",
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
| GET CITIZEN'S OWN REGISTRATION REQUESTS
| GET /api/property-registrations/mine
|--------------------------------------------------------------------------
|
| Returns only registrations submitted by the authenticated citizen.
|
| Used by:
|   - Citizen My Properties
|   - Registration status
|   - Approval status
|   - Registration number
|   - Ownership information
|
*/

router.get(
    "/mine",
    authenticateToken,
    requireRole("CITIZEN"),
    async (req, res) => {
        try {
            const authenticatedUser =
                (req as AuthenticatedRequest).user;

            const citizenId =
                authenticatedUser?.id;

            if (!citizenId) {
                return res.status(401).json({
                    status: "error",
                    message:
                        "Authenticated user ID not found",
                });
            }

            /*
             * ---------------------------------------------------------------
             * FETCH CITIZEN REGISTRATIONS
             * ---------------------------------------------------------------
             */

            const result =
                await pool.query(
                    `
                    SELECT
                        pr.id,
                        pr.property_unit_id,

                        pr.owner_id,
                        pr.ownership_id,

                        pr.status,
                        pr.registration_number,

                        pr.submitted_by,
                        pr.reviewed_by,

                        pr.submitted_at,
                        pr.reviewed_at,

                        pr.remarks,

                        pr.created_at,
                        pr.updated_at,

                        /*
                         * PROPERTY UNIT
                         */

                        pu.unit_number,
                        pu.vertical_property_id,
                        pu.parent_ulpin,
                        pu.area_sq_m,
                        pu.min_z,
                        pu.max_z,

                        /*
                         * FLOOR
                         */

                        f.floor_number,
                        f.floor_label,

                        /*
                         * BUILDING
                         */

                        b.id AS building_id,
                        b.building_name,

                        /*
                         * OWNER
                         */

                        o.name AS owner_name,
                        o.contact AS owner_contact,

                        /*
                         * OWNERSHIP
                         */

                        po.ownership_percentage,
                        po.valid_from AS ownership_valid_from,
                        po.valid_to AS ownership_valid_to,

                        /*
                         * REVIEWER
                         */

                        reviewer.name AS reviewer_name,
                        reviewer.email AS reviewer_email

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

                    LEFT JOIN users reviewer
                        ON reviewer.id = pr.reviewed_by

                    WHERE pr.submitted_by = $1::uuid

                    ORDER BY
                        pr.created_at DESC
                    `,
                    [citizenId]
                );

            /*
             * ---------------------------------------------------------------
             * FORMAT REGISTRATIONS
             * ---------------------------------------------------------------
             */

            const registrations =
                result.rows.map(
                    (row) => ({
                        id:
                            row.id,

                        property_unit_id:
                            row.property_unit_id,

                        owner_id:
                            row.owner_id,

                        ownership_id:
                            row.ownership_id,

                        status:
                            row.status,

                        registration_number:
                            row.registration_number,

                        submitted_by:
                            row.submitted_by,

                        reviewed_by:
                            row.reviewed_by,

                        submitted_at:
                            row.submitted_at,

                        reviewed_at:
                            row.reviewed_at,

                        remarks:
                            row.remarks,

                        created_at:
                            row.created_at,

                        updated_at:
                            row.updated_at,

                        /*
                         * PROPERTY
                         */

                        property: {
                            unit_number:
                                row.unit_number,

                            vertical_property_id:
                                row.vertical_property_id,

                            parent_ulpin:
                                row.parent_ulpin,

                            area_sq_m:
                                row.area_sq_m,

                            min_z:
                                row.min_z,

                            max_z:
                                row.max_z,

                            floor_number:
                                Number(
                                    row.floor_number
                                ),

                            floor_label:
                                row.floor_label,

                            building_id:
                                row.building_id,

                            building_name:
                                row.building_name,
                        },

                        /*
                         * OWNER
                         */

                        owner:
                            row.owner_id
                                ? {
                                    id:
                                        row.owner_id,

                                    name:
                                        row.owner_name,

                                    contact:
                                        row.owner_contact,
                                }
                                : null,

                        /*
                         * OWNERSHIP
                         */

                        ownership:
                            row.ownership_id
                                ? {
                                    id:
                                        row.ownership_id,

                                    percentage:
                                        row.ownership_percentage,

                                    valid_from:
                                        row.ownership_valid_from,

                                    valid_to:
                                        row.ownership_valid_to,
                                }
                                : null,

                        /*
                         * REVIEWER
                         */

                        reviewer:
                            row.reviewed_by
                                ? {
                                    id:
                                        row.reviewed_by,

                                    name:
                                        row.reviewer_name,

                                    email:
                                        row.reviewer_email,
                                }
                                : null,
                    })
                );

            /*
             * ---------------------------------------------------------------
             * STATISTICS
             * ---------------------------------------------------------------
             */

            const stats = {
                total:
                    registrations.length,

                pending:
                    registrations.filter(
                        (item) =>
                            item.status ===
                            "PENDING"
                    ).length,

                approved:
                    registrations.filter(
                        (item) =>
                            item.status ===
                            "APPROVED"
                    ).length,

                rejected:
                    registrations.filter(
                        (item) =>
                            item.status ===
                            "REJECTED"
                    ).length,
            };

            return res.json({
                status: "ok",

                stats,

                registrations,
            });
        } catch (error) {
            console.error(
                "Get citizen registrations error:",
                error
            );

            return res.status(500).json({
                status: "error",

                message:
                    "Failed to load your property registrations",
            });
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