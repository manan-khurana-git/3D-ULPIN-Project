CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- USERS / AUTHENTICATION
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(200) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    role VARCHAR(50) NOT NULL DEFAULT 'CITIZEN'
        CHECK (role IN (
            'ADMIN',
            'GOVERNMENT_OFFICER',
            'SURVEYOR',
            'CITIZEN'
        )),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx
ON users(email);

CREATE INDEX IF NOT EXISTS users_role_idx
ON users(role);

-- ============================================
-- PARCELS
-- Existing land parcel / ULPIN
-- ============================================

CREATE TABLE IF NOT EXISTS parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    ulpin VARCHAR(14) NOT NULL UNIQUE,

    parcel_number VARCHAR(100),

    area_sq_m NUMERIC(12, 2),

    base_elevation_m NUMERIC(10, 3) DEFAULT 0,

    geometry geometry(PolygonZ, 4326),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parcels_geometry_idx
ON parcels
USING GIST (geometry);


-- ============================================
-- BUILDINGS
-- ============================================

CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    parcel_id UUID NOT NULL
        REFERENCES parcels(id)
        ON DELETE CASCADE,

    building_name VARCHAR(200),

    number_of_floors INTEGER NOT NULL DEFAULT 1,

    floor_height_m NUMERIC(8, 3) NOT NULL DEFAULT 3.0,

    base_elevation_m NUMERIC(10, 3) NOT NULL DEFAULT 0,

    geometry geometry(PolyhedralSurfaceZ, 4326),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS buildings_geometry_idx
ON buildings
USING GIST (geometry);


-- ============================================
-- FLOORS
-- ============================================

CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    building_id UUID NOT NULL
        REFERENCES buildings(id)
        ON DELETE CASCADE,

    floor_number INTEGER NOT NULL,

    floor_label VARCHAR(50),

    min_z NUMERIC(10, 3) NOT NULL,

    max_z NUMERIC(10, 3) NOT NULL,

    geometry geometry(PolyhedralSurfaceZ, 4326),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(building_id, floor_number)
);

CREATE INDEX IF NOT EXISTS floors_geometry_idx
ON floors
USING GIST (geometry);


-- ============================================
-- PROPERTY UNITS
-- ============================================

CREATE TABLE IF NOT EXISTS property_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    floor_id UUID NOT NULL
        REFERENCES floors(id)
        ON DELETE CASCADE,

    unit_number VARCHAR(50) NOT NULL,

    -- Existing 14-digit land parcel identifier
    parent_ulpin VARCHAR(14) NOT NULL,

    -- Proposed/derived vertical identifier
    vertical_property_id VARCHAR(100) NOT NULL UNIQUE,

    area_sq_m NUMERIC(12, 2),

    min_z NUMERIC(10, 3) NOT NULL,

    max_z NUMERIC(10, 3) NOT NULL,

    geometry geometry(PolyhedralSurfaceZ, 4326),

    metadata JSONB DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(floor_id, unit_number)
);

CREATE INDEX IF NOT EXISTS property_units_geometry_idx
ON property_units
USING GIST (geometry);

CREATE INDEX IF NOT EXISTS property_units_parent_ulpin_idx
ON property_units(parent_ulpin);


-- ============================================
-- OWNERS
-- ============================================

CREATE TABLE IF NOT EXISTS owners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(200) NOT NULL,

    contact VARCHAR(100),

    metadata JSONB DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================
-- PROPERTY OWNERSHIP
-- ============================================

CREATE TABLE IF NOT EXISTS property_ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    property_unit_id UUID NOT NULL
        REFERENCES property_units(id)
        ON DELETE CASCADE,

    owner_id UUID NOT NULL
        REFERENCES owners(id)
        ON DELETE CASCADE,

    ownership_percentage NUMERIC(5, 2) DEFAULT 100.00,

    valid_from DATE,

    valid_to DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================
-- PROPERTY TAX
-- ============================================

CREATE TABLE IF NOT EXISTS property_tax (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    property_unit_id UUID NOT NULL
        REFERENCES property_units(id)
        ON DELETE CASCADE,

    assessment_year INTEGER NOT NULL,

    assessed_value NUMERIC(15, 2),

    tax_amount NUMERIC(15, 2),

    payment_status VARCHAR(30) DEFAULT 'PENDING',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(property_unit_id, assessment_year)
);


-- ============================================
-- UTILITIES
-- ============================================

CREATE TABLE IF NOT EXISTS utilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    property_unit_id UUID
        REFERENCES property_units(id)
        ON DELETE CASCADE,

    utility_type VARCHAR(50) NOT NULL,

    connection_number VARCHAR(100),

    provider VARCHAR(200),

    status VARCHAR(30) DEFAULT 'ACTIVE',

    metadata JSONB DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PROPERTY TRANSFER REQUESTS
-- Citizen-initiated ownership transfer workflow
-- ============================================

CREATE TABLE IF NOT EXISTS property_transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    property_unit_id UUID NOT NULL
        REFERENCES property_units(id)
        ON DELETE CASCADE,

    current_owner_id UUID NOT NULL
        REFERENCES owners(id)
        ON DELETE RESTRICT,

    new_owner_name VARCHAR(200) NOT NULL,

    new_owner_contact VARCHAR(100),

    ownership_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00
        CHECK (
            ownership_percentage > 0
            AND ownership_percentage <= 100
        ),

    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'APPROVED',
                'REJECTED'
            )
        ),

    submitted_by UUID NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    reviewed_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    reviewed_at TIMESTAMPTZ,

    remarks TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS property_transfer_requests_property_idx
ON property_transfer_requests(property_unit_id);

CREATE INDEX IF NOT EXISTS property_transfer_requests_status_idx
ON property_transfer_requests(status);

CREATE INDEX IF NOT EXISTS property_transfer_requests_submitted_by_idx
ON property_transfer_requests(submitted_by);

CREATE INDEX IF NOT EXISTS property_transfer_requests_reviewed_by_idx
ON property_transfer_requests(reviewed_by);

CREATE INDEX IF NOT EXISTS property_transfer_requests_created_at_idx
ON property_transfer_requests(created_at);