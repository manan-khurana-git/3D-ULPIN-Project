import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
    clearAuthData,
    getAuthToken,
    getAuthUser,
    type AuthUser,
} from "../services/authService.ts";

import "./CitizenDashboard.css";

type RegistrationStatus =
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | string;

type CitizenRegistration = {
    id: string;
    property_unit_id: string;
    owner_id: string | null;
    ownership_id: string | null;

    status: RegistrationStatus;
    registration_number: string | null;

    submitted_by: string;
    reviewed_by: string | null;

    submitted_at: string;
    reviewed_at: string | null;

    remarks: string | null;

    created_at: string;
    updated_at: string;

    property: {
        unit_number: string;
        vertical_property_id: string;
        parent_ulpin: string;
        area_sq_m: string | number;
        min_z: string | number;
        max_z: string | number;

        floor_number: number;
        floor_label: string;

        building_id: string;
        building_name: string;
    };

    owner: {
        id: string;
        name: string;
        contact: string;
    } | null;

    ownership: {
        id: string;
        percentage: string | number;
        valid_from: string;
        valid_to: string | null;
    } | null;

    reviewer: {
        id: string;
        name: string;
        email: string;
    } | null;
};

type RegistrationStats = {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
};

type CitizenRegistrationResponse = {
    status: string;
    stats: RegistrationStats;
    registrations: CitizenRegistration[];
};

const API_BASE_URL = "http://localhost:5000/api";

function formatDate(value: string | null) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function formatDateTime(value: string | null) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatArea(value: string | number) {
    const area = Number(value);

    if (!Number.isFinite(area)) {
        return "—";
    }

    return `${area.toLocaleString("en-IN", {
        maximumFractionDigits: 2,
    })} m²`;
}

function formatPercentage(value: string | number) {
    const percentage = Number(value);

    if (!Number.isFinite(percentage)) {
        return "—";
    }

    return `${percentage.toLocaleString("en-IN", {
        maximumFractionDigits: 2,
    })}%`;
}

function statusLabel(status: RegistrationStatus) {
    switch (status) {
        case "PENDING":
            return "Pending Review";

        case "APPROVED":
            return "Registered";

        case "REJECTED":
            return "Rejected";

        default:
            return status;
    }
}

function statusClass(status: RegistrationStatus) {
    switch (status) {
        case "PENDING":
            return "status-pending";

        case "APPROVED":
            return "status-approved";

        case "REJECTED":
            return "status-rejected";

        default:
            return "status-neutral";
    }
}

function StatIcon({
    type,
}: {
    type: "total" | "pending" | "approved" | "rejected";
}) {
    if (type === "total") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                    d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                />
                <path
                    d="M8 8h8M8 12h8M8 16h5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.7"
                />
            </svg>
        );
    }

    if (type === "pending") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                    cx="12"
                    cy="12"
                    r="8.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                />
                <path
                    d="M12 7.5v5l3.2 2"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.7"
                />
            </svg>
        );
    }

    if (type === "approved") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                    cx="12"
                    cy="12"
                    r="8.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                />
                <path
                    d="m8 12.2 2.6 2.7 5.5-6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.9"
                />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle
                cx="12"
                cy="12"
                r="8.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
            />
            <path
                d="m9 9 6 6M15 9l-6 6"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
            />
        </svg>
    );
}

function CitizenDashboard() {
    const navigate = useNavigate();

    const [user, setUser] = useState<AuthUser | null>(
        getAuthUser()
    );

    const [registrations, setRegistrations] = useState<
        CitizenRegistration[]
    >([]);

    const [stats, setStats] = useState<RegistrationStats>({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
    });

    const [selectedRegistration, setSelectedRegistration] =
        useState<CitizenRegistration | null>(null);

    const [filter, setFilter] = useState<
        "ALL" | "PENDING" | "APPROVED" | "REJECTED"
    >("ALL");

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState("");

    const loadRegistrations = useCallback(
        async (showRefreshing = false) => {
            const token = getAuthToken();

            if (!token) {
                clearAuthData();
                navigate("/login", { replace: true });
                return;
            }

            if (showRefreshing) {
                setIsRefreshing(true);
            } else {
                setIsLoading(true);
            }

            setError("");

            try {
                const response = await fetch(
                    `${API_BASE_URL}/property-registrations/mine`,
                    {
                        method: "GET",
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                const data =
                    (await response.json()) as
                        | CitizenRegistrationResponse
                        | {
                              message?: string;
                          };

                if (!response.ok) {
                    if (response.status === 401) {
                        clearAuthData();
                        navigate("/login", {
                            replace: true,
                        });
                        return;
                    }

                    throw new Error(
                        "message" in data && data.message
                            ? data.message
                            : "Failed to load your properties"
                    );
                }

                const successData =
                    data as CitizenRegistrationResponse;

                setRegistrations(
                    successData.registrations ?? []
                );

                setStats(
                    successData.stats ?? {
                        total: 0,
                        pending: 0,
                        approved: 0,
                        rejected: 0,
                    }
                );
            } catch (requestError) {
                console.error(
                    "Citizen property loading error:",
                    requestError
                );

                setError(
                    requestError instanceof Error
                        ? requestError.message
                        : "Failed to load your properties"
                );
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [navigate]
    );

    useEffect(() => {
        const currentUser = getAuthUser();

        if (!currentUser) {
            navigate("/login", { replace: true });
            return;
        }

        setUser(currentUser);

        if (currentUser.role !== "CITIZEN") {
            navigate("/dashboard", { replace: true });
            return;
        }

        void loadRegistrations();
    }, [loadRegistrations, navigate]);

    const filteredRegistrations = useMemo(() => {
        if (filter === "ALL") {
            return registrations;
        }

        return registrations.filter(
            (registration) =>
                registration.status === filter
        );
    }, [filter, registrations]);

    const handleLogout = () => {
        clearAuthData();
        navigate("/login", { replace: true });
    };

    const open3DExplorer = (
        registration: CitizenRegistration
    ) => {
        /*
         * The existing 3D explorer remains at /dashboard.
         * The selected VPID is passed through the URL so it can
         * be integrated with the Cesium explorer later.
         */
        navigate(
            `/dashboard?vpid=${encodeURIComponent(
                registration.property.vertical_property_id
            )}`
        );
    };

    return (
        <div className="citizen-page">
            <header className="citizen-topbar">
                <div className="citizen-brand">
                    <div className="citizen-brand-mark">
                        <svg
                            viewBox="0 0 32 32"
                            aria-hidden="true"
                        >
                            <path
                                d="M5 13.5 16 5l11 8.5v12A1.5 1.5 0 0 1 25.5 27h-19A1.5 1.5 0 0 1 5 25.5v-12Z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                            />
                            <path
                                d="M11 27V16h10v11M9 12h14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                            />
                        </svg>
                    </div>

                    <div>
                        <div className="citizen-brand-title">
                            3D ULPIN
                        </div>

                        <div className="citizen-brand-subtitle">
                            Digital Property Portal
                        </div>
                    </div>
                </div>

                <div className="citizen-topbar-right">
                    <div className="citizen-user">
                        <div className="citizen-user-avatar">
                            {(user?.name?.charAt(0) ?? "C")
                                .toUpperCase()}
                        </div>

                        <div className="citizen-user-info">
                            <strong>
                                {user?.name ?? "Citizen"}
                            </strong>

                            <span>
                                Citizen Account
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="citizen-logout"
                        onClick={handleLogout}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M14 8l4 4-4 4M18 12H9"
                                fill="none"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.8"
                            />
                        </svg>
                        Logout
                    </button>
                </div>
            </header>

            <main className="citizen-content">
                <section className="citizen-hero">
                    <div>
                        <div className="citizen-eyebrow">
                            CITIZEN PORTAL
                        </div>

                        <h1>
                            Welcome,{" "}
                            {user?.name ?? "Citizen"}
                        </h1>

                        <p>
                            View your registered properties,
                            track applications, and explore
                            your digital property identity.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="explorer-button"
                        onClick={() =>
                            navigate("/dashboard")
                        }
                    >
                        <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z"
                                fill="none"
                                stroke="currentColor"
                                strokeLinejoin="round"
                                strokeWidth="1.6"
                            />
                            <path
                                d="M4.5 8.2 12 12l7.5-3.8M12 12v8"
                                fill="none"
                                stroke="currentColor"
                                strokeLinejoin="round"
                                strokeWidth="1.6"
                            />
                        </svg>
                        Open 3D Explorer
                    </button>
                </section>

                <section className="citizen-stats">
                    <div className="citizen-stat-card">
                        <div className="stat-icon stat-icon-total">
                            <StatIcon type="total" />
                        </div>

                        <div>
                            <span>Total Records</span>
                            <strong>{stats.total}</strong>
                        </div>
                    </div>

                    <div className="citizen-stat-card">
                        <div className="stat-icon stat-icon-pending">
                            <StatIcon type="pending" />
                        </div>

                        <div>
                            <span>Pending Review</span>
                            <strong>{stats.pending}</strong>
                        </div>
                    </div>

                    <div className="citizen-stat-card">
                        <div className="stat-icon stat-icon-approved">
                            <StatIcon type="approved" />
                        </div>

                        <div>
                            <span>Registered</span>
                            <strong>{stats.approved}</strong>
                        </div>
                    </div>

                    <div className="citizen-stat-card">
                        <div className="stat-icon stat-icon-rejected">
                            <StatIcon type="rejected" />
                        </div>

                        <div>
                            <span>Rejected</span>
                            <strong>{stats.rejected}</strong>
                        </div>
                    </div>
                </section>

                <section className="citizen-section">
                    <div className="citizen-section-header">
                        <div>
                            <div className="section-kicker">
                                PROPERTY REGISTRY
                            </div>

                            <h2>
                                My Properties
                            </h2>

                            <p>
                                Your property registration
                                requests and verified digital
                                property records.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="refresh-button"
                            onClick={() =>
                                void loadRegistrations(
                                    true
                                )
                            }
                            disabled={isRefreshing}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                className={
                                    isRefreshing
                                        ? "refresh-spin"
                                        : ""
                                }
                            >
                                <path
                                    d="M20 11a8 8 0 0 0-14.7-4.2L4 9M4 5v4h4M4 13a8 8 0 0 0 14.7 4.2L20 15m0 4v-4h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.7"
                                />
                            </svg>
                            {isRefreshing
                                ? "Refreshing..."
                                : "Refresh"}
                        </button>
                    </div>

                    <div className="property-filters">
                        {(
                            [
                                ["ALL", "All Properties"],
                                ["PENDING", "Pending"],
                                ["APPROVED", "Registered"],
                                ["REJECTED", "Rejected"],
                            ] as const
                        ).map(
                            ([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={
                                        filter === value
                                            ? "filter-button active"
                                            : "filter-button"
                                    }
                                    onClick={() =>
                                        setFilter(value)
                                    }
                                >
                                    {label}

                                    <span>
                                        {value === "ALL"
                                            ? stats.total
                                            : value ===
                                              "PENDING"
                                            ? stats.pending
                                            : value ===
                                              "APPROVED"
                                            ? stats.approved
                                            : stats.rejected}
                                    </span>
                                </button>
                            )
                        )}
                    </div>

                    {error && (
                        <div className="citizen-error">
                            <strong>
                                Unable to load properties
                            </strong>

                            <span>{error}</span>

                            <button
                                type="button"
                                onClick={() =>
                                    void loadRegistrations()
                                }
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="property-loading">
                            <div className="loading-spinner" />

                            <span>
                                Loading your property
                                records...
                            </span>
                        </div>
                    ) : filteredRegistrations.length ===
                      0 ? (
                        <div className="empty-properties">
                            <div className="empty-icon">
                                <svg
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <path
                                        d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5v-8Z"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinejoin="round"
                                        strokeWidth="1.5"
                                    />
                                    <path
                                        d="M4.5 8.8 12 13l7.5-4.2M12 13v8"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinejoin="round"
                                        strokeWidth="1.5"
                                    />
                                </svg>
                            </div>

                            <h3>
                                No properties found
                            </h3>

                            <p>
                                {filter === "ALL"
                                    ? "You do not have any property registration records yet."
                                    : `You do not have any ${filter.toLowerCase()} property records.`}
                            </p>

                            <button
                                type="button"
                                onClick={() =>
                                    navigate(
                                        "/dashboard"
                                    )
                                }
                            >
                                Explore Properties
                            </button>
                        </div>
                    ) : (
                        <div className="property-grid">
                            {filteredRegistrations.map(
                                (
                                    registration
                                ) => (
                                    <article
                                        key={
                                            registration.id
                                        }
                                        className="property-card"
                                    >
                                        <div className="property-card-top">
                                            <div
                                                className={`property-status ${statusClass(
                                                    registration.status
                                                )}`}
                                            >
                                                <span className="status-dot" />

                                                {
                                                    statusLabel(
                                                        registration.status
                                                    )
                                                }
                                            </div>

                                            {registration.registration_number && (
                                                <div className="registration-number">
                                                    {
                                                        registration.registration_number
                                                    }
                                                </div>
                                            )}
                                        </div>

                                        <div className="property-main">
                                            <div className="property-building-icon">
                                                <svg
                                                    viewBox="0 0 32 32"
                                                    aria-hidden="true"
                                                >
                                                    <path
                                                        d="M7 27V7.5L16 4l9 3.5V27"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeLinejoin="round"
                                                        strokeWidth="1.6"
                                                    />
                                                    <path
                                                        d="M11 10h2M19 10h2M11 15h2M19 15h2M11 20h2M19 20h2M14 27v-4h4v4"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeLinecap="round"
                                                        strokeWidth="1.5"
                                                    />
                                                </svg>
                                            </div>

                                            <div className="property-title">
                                                <h3>
                                                    {
                                                        registration
                                                            .property
                                                            .building_name
                                                    }
                                                </h3>

                                                <p>
                                                    {
                                                        registration
                                                            .property
                                                            .floor_label
                                                    }{" "}
                                                    · Unit{" "}
                                                    {
                                                        registration
                                                            .property
                                                            .unit_number
                                                    }
                                                </p>
                                            </div>
                                        </div>

                                        <div className="property-vpid">
                                            <span>
                                                VPID
                                            </span>

                                            <strong>
                                                {
                                                    registration
                                                        .property
                                                        .vertical_property_id
                                                }
                                            </strong>
                                        </div>

                                        <div className="property-details">
                                            <div>
                                                <span>
                                                    ULPIN
                                                </span>

                                                <strong>
                                                    {
                                                        registration
                                                            .property
                                                            .parent_ulpin
                                                    }
                                                </strong>
                                            </div>

                                            <div>
                                                <span>
                                                    Ownership
                                                </span>

                                                <strong>
                                                    {formatPercentage(
                                                        registration
                                                            .ownership
                                                            ?.percentage ??
                                                            0
                                                    )}
                                                </strong>
                                            </div>

                                            <div>
                                                <span>
                                                    Area
                                                </span>

                                                <strong>
                                                    {formatArea(
                                                        registration
                                                            .property
                                                            .area_sq_m
                                                    )}
                                                </strong>
                                            </div>

                                            <div>
                                                <span>
                                                    Elevation
                                                </span>

                                                <strong>
                                                    {
                                                        registration
                                                            .property
                                                            .min_z
                                                    }{" "}
                                                    →{" "}
                                                    {
                                                        registration
                                                            .property
                                                            .max_z
                                                    }{" "}
                                                    m
                                                </strong>
                                            </div>
                                        </div>

                                        <div className="property-owner">
                                            <div className="owner-avatar">
                                                {(
                                                    registration
                                                        .owner
                                                        ?.name ??
                                                    "?"
                                                )
                                                    .charAt(
                                                        0
                                                    )
                                                    .toUpperCase()}
                                            </div>

                                            <div>
                                                <span>
                                                    Registered
                                                    Owner
                                                </span>

                                                <strong>
                                                    {
                                                        registration
                                                            .owner
                                                            ?.name ??
                                                        "Not assigned"
                                                    }
                                                </strong>
                                            </div>

                                            <div className="owner-percentage">
                                                {formatPercentage(
                                                    registration
                                                        .ownership
                                                        ?.percentage ??
                                                        0
                                                )}
                                            </div>
                                        </div>

                                        <div className="property-card-footer">
                                            <div className="submitted-info">
                                                <span>
                                                    Submitted
                                                </span>

                                                <strong>
                                                    {formatDate(
                                                        registration.submitted_at
                                                    )}
                                                </strong>
                                            </div>

                                            <div className="property-actions">
                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    onClick={() =>
                                                        setSelectedRegistration(
                                                            registration
                                                        )
                                                    }
                                                >
                                                    View Details
                                                </button>

                                                <button
                                                    type="button"
                                                    className="primary-action"
                                                    onClick={() =>
                                                        open3DExplorer(
                                                            registration
                                                        )
                                                    }
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        aria-hidden="true"
                                                    >
                                                        <path
                                                            d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeLinejoin="round"
                                                            strokeWidth="1.5"
                                                        />
                                                        <path
                                                            d="M4.5 8.2 12 12l7.5-3.8M12 12v8"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeLinejoin="round"
                                                            strokeWidth="1.5"
                                                        />
                                                    </svg>
                                                    Open in 3D
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                )
                            )}
                        </div>
                    )}
                </section>
            </main>

            {selectedRegistration && (
                <div
                    className="citizen-modal-backdrop"
                    onMouseDown={(event) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            setSelectedRegistration(
                                null
                            );
                        }
                    }}
                >
                    <div className="citizen-modal">
                        <div className="citizen-modal-header">
                            <div>
                                <div className="section-kicker">
                                    PROPERTY RECORD
                                </div>

                                <h2>
                                    {
                                        selectedRegistration
                                            .property
                                            .building_name
                                    }
                                </h2>

                                <p>
                                    {
                                        selectedRegistration
                                            .property
                                            .floor_label
                                    }{" "}
                                    · Unit{" "}
                                    {
                                        selectedRegistration
                                            .property
                                            .unit_number
                                    }
                                </p>
                            </div>

                            <button
                                type="button"
                                className="modal-close"
                                onClick={() =>
                                    setSelectedRegistration(
                                        null
                                    )
                                }
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <div className="modal-status-row">
                            <div
                                className={`property-status ${statusClass(
                                    selectedRegistration.status
                                )}`}
                            >
                                <span className="status-dot" />

                                {statusLabel(
                                    selectedRegistration.status
                                )}
                            </div>

                            {selectedRegistration.registration_number && (
                                <strong>
                                    {
                                        selectedRegistration.registration_number
                                    }
                                </strong>
                            )}
                        </div>

                        <div className="modal-vpid">
                            <span>
                                Vertical Property ID
                            </span>

                            <strong>
                                {
                                    selectedRegistration
                                        .property
                                        .vertical_property_id
                                }
                            </strong>
                        </div>

                        <div className="modal-grid">
                            <div className="modal-field">
                                <span>
                                    Parent ULPIN
                                </span>

                                <strong>
                                    {
                                        selectedRegistration
                                            .property
                                            .parent_ulpin
                                    }
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Property Unit ID
                                </span>

                                <strong>
                                    {
                                        selectedRegistration.property_unit_id
                                    }
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Floor
                                </span>

                                <strong>
                                    {
                                        selectedRegistration
                                            .property
                                            .floor_label
                                    }
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Unit
                                </span>

                                <strong>
                                    {
                                        selectedRegistration
                                            .property
                                            .unit_number
                                    }
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Area
                                </span>

                                <strong>
                                    {formatArea(
                                        selectedRegistration
                                            .property
                                            .area_sq_m
                                    )}
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Vertical Range
                                </span>

                                <strong>
                                    {
                                        selectedRegistration
                                            .property
                                            .min_z
                                    }{" "}
                                    →{" "}
                                    {
                                        selectedRegistration
                                            .property
                                            .max_z
                                    }{" "}
                                    m
                                </strong>
                            </div>
                        </div>

                        <div className="modal-section">
                            <h3>
                                Ownership
                            </h3>

                            <div className="ownership-panel">
                                <div className="owner-avatar large">
                                    {(
                                        selectedRegistration
                                            .owner?.name ??
                                        "?"
                                    )
                                        .charAt(0)
                                        .toUpperCase()}
                                </div>

                                <div className="ownership-person">
                                    <span>
                                        Owner
                                    </span>

                                    <strong>
                                        {
                                            selectedRegistration
                                                .owner
                                                ?.name
                                        }
                                    </strong>

                                    <small>
                                        {
                                            selectedRegistration
                                                .owner
                                                ?.contact
                                        }
                                    </small>
                                </div>

                                <div className="ownership-value">
                                    <span>
                                        Ownership
                                    </span>

                                    <strong>
                                        {formatPercentage(
                                            selectedRegistration
                                                .ownership
                                                ?.percentage ??
                                                0
                                        )}
                                    </strong>
                                </div>
                            </div>
                        </div>

                        <div className="modal-section">
                            <h3>
                                Registration Timeline
                            </h3>

                            <div className="timeline">
                                <div className="timeline-item complete">
                                    <span className="timeline-dot" />

                                    <div>
                                        <strong>
                                            Request
                                            Submitted
                                        </strong>

                                        <span>
                                            {formatDateTime(
                                                selectedRegistration.submitted_at
                                            )}
                                        </span>
                                    </div>
                                </div>

                                <div
                                    className={
                                        selectedRegistration.reviewed_at
                                            ? "timeline-item complete"
                                            : "timeline-item"
                                    }
                                >
                                    <span className="timeline-dot" />

                                    <div>
                                        <strong>
                                            Government
                                            Review
                                        </strong>

                                        <span>
                                            {selectedRegistration.reviewed_at
                                                ? formatDateTime(
                                                      selectedRegistration.reviewed_at
                                                  )
                                                : "Awaiting review"}
                                        </span>
                                    </div>
                                </div>

                                <div
                                    className={
                                        selectedRegistration.status ===
                                        "APPROVED"
                                            ? "timeline-item complete"
                                            : selectedRegistration.status ===
                                              "REJECTED"
                                            ? "timeline-item rejected"
                                            : "timeline-item"
                                    }
                                >
                                    <span className="timeline-dot" />

                                    <div>
                                        <strong>
                                            {selectedRegistration.status ===
                                            "APPROVED"
                                                ? "Property Registered"
                                                : selectedRegistration.status ===
                                                  "REJECTED"
                                                ? "Registration Rejected"
                                                : "Registration Decision"}
                                        </strong>

                                        <span>
                                            {selectedRegistration.registration_number ??
                                                (selectedRegistration.status ===
                                                "PENDING"
                                                    ? "Decision pending"
                                                    : "—")}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedRegistration.reviewer && (
                            <div className="reviewer-box">
                                <span>
                                    Reviewed By
                                </span>

                                <strong>
                                    {
                                        selectedRegistration
                                            .reviewer.name
                                    }
                                </strong>

                                <small>
                                    {
                                        selectedRegistration
                                            .reviewer.email
                                    }
                                </small>
                            </div>
                        )}

                        {selectedRegistration.remarks && (
                            <div className="remarks-box">
                                <span>
                                    Remarks
                                </span>

                                <p>
                                    {
                                        selectedRegistration.remarks
                                    }
                                </p>
                            </div>
                        )}

                        <div className="citizen-modal-footer">
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={() =>
                                    setSelectedRegistration(
                                        null
                                    )
                                }
                            >
                                Close
                            </button>

                            <button
                                type="button"
                                className="primary-action"
                                onClick={() => {
                                    open3DExplorer(
                                        selectedRegistration
                                    );
                                    setSelectedRegistration(
                                        null
                                    );
                                }}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <path
                                        d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinejoin="round"
                                        strokeWidth="1.5"
                                    />
                                    <path
                                        d="M4.5 8.2 12 12l7.5-3.8M12 12v8"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinejoin="round"
                                        strokeWidth="1.5"
                                    />
                                </svg>
                                Open Property in 3D
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CitizenDashboard;