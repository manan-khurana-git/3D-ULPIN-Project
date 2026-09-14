import {
    useEffect,
    useMemo,
    useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
    clearAuthData,
    getAuthToken,
    getAuthUser,
} from "../services/authService";

import "./GovernmentOfficerDashboard.css";

type RegistrationStatus =
    | "PENDING"
    | "APPROVED"
    | "REJECTED";

type Registration = {
    id: string;

    property_unit_id: string;

    owner_id: string | null;
    owner_name: string | null;
    owner_contact: string | null;

    ownership_id: string | null;
    ownership_percentage:
        | number
        | string
        | null;

    status: RegistrationStatus;

    registration_number:
        | string
        | null;

    submitted_by: string | null;
    submitted_by_name:
        | string
        | null;

    reviewed_by: string | null;
    reviewed_by_name:
        | string
        | null;

    submitted_at: string;
    reviewed_at: string | null;

    remarks: string | null;

    created_at: string;
    updated_at: string;

    unit_number: string;
    vertical_property_id: string;
    parent_ulpin: string;

    floor_number: number;
    floor_label: string;

    building_id: string;
    building_name: string;
};

type TransferStatus =
    | "PENDING"
    | "APPROVED"
    | "REJECTED";

type TransferRequest = {
    id: string;

    property_unit_id: string;
    current_owner_id: string;

    new_owner_name: string;
    new_owner_contact: string | null;

    ownership_percentage:
        | number
        | string;

    transfer_date: string;

    status: TransferStatus;

    submitted_by: string;
    submitted_by_name: string | null;
    submitted_by_email: string | null;

    reviewed_by: string | null;
    reviewed_by_name: string | null;
    reviewed_by_email: string | null;

    submitted_at: string;
    reviewed_at: string | null;

    remarks: string | null;

    created_at: string;
    updated_at: string;

    unit_number: string;
    vertical_property_id: string;
    parent_ulpin: string;

    floor_number: number;
    floor_label: string;

    building_id: string;
    building_name: string;

    current_owner_name: string;
    current_owner_contact: string | null;
};

type FilterType =
    | "ALL"
    | RegistrationStatus;

type TransferFilterType =
    | "ALL"
    | TransferStatus;

const API_BASE_URL =
    "http://localhost:5000/api";

function GovernmentOfficerDashboard() {
    const navigate = useNavigate();

    const user = getAuthUser();

    /*
     * --------------------------------------------------------------------------
     * REGISTRATION STATE
     * --------------------------------------------------------------------------
     */

    const [
        registrations,
        setRegistrations,
    ] = useState<Registration[]>([]);

    const [
        selectedRegistration,
        setSelectedRegistration,
    ] =
        useState<Registration | null>(
            null
        );

    const [
        activeFilter,
        setActiveFilter,
    ] =
        useState<FilterType>("ALL");

    /*
     * --------------------------------------------------------------------------
     * TRANSFER STATE
     * --------------------------------------------------------------------------
     */

    const [
        transferRequests,
        setTransferRequests,
    ] = useState<TransferRequest[]>([]);

    const [
        selectedTransfer,
        setSelectedTransfer,
    ] =
        useState<TransferRequest | null>(
            null
        );

    const [
        transferFilter,
        setTransferFilter,
    ] =
        useState<TransferFilterType>(
            "ALL"
        );

    /*
     * --------------------------------------------------------------------------
     * COMMON STATE
     * --------------------------------------------------------------------------
     */

    const [
        reviewRemarks,
        setReviewRemarks,
    ] = useState("");

    const [
        isLoading,
        setIsLoading,
    ] = useState(true);

    const [
        isTransferLoading,
        setIsTransferLoading,
    ] = useState(true);

    const [
        isProcessing,
        setIsProcessing,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState("");

    const [
        success,
        setSuccess,
    ] = useState("");

    /*
     * --------------------------------------------------------------------------
     * LOAD REGISTRATION REQUESTS
     * --------------------------------------------------------------------------
     */

    async function loadRegistrations() {
        const token = getAuthToken();

        if (!token) {
            clearAuthData();

            navigate("/login", {
                replace: true,
            });

            return;
        }

        try {
            setIsLoading(true);
            setError("");

            const response =
                await fetch(
                    `${API_BASE_URL}/property-registrations`,
                    {
                        method: "GET",
                        headers: {
                            Authorization:
                                `Bearer ${token}`,
                        },
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                if (
                    response.status ===
                    401
                ) {
                    clearAuthData();

                    navigate("/login", {
                        replace: true,
                    });

                    return;
                }

                throw new Error(
                    data.message ||
                    "Failed to load registration requests"
                );
            }

            setRegistrations(
                data.registrations || []
            );
        } catch (err) {
            console.error(
                "Registration loading error:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load registration requests"
            );
        } finally {
            setIsLoading(false);
        }
    }

    /*
     * --------------------------------------------------------------------------
     * LOAD TRANSFER REQUESTS
     * --------------------------------------------------------------------------
     */

    async function loadTransferRequests() {
        const token = getAuthToken();

        if (!token) {
            clearAuthData();

            navigate("/login", {
                replace: true,
            });

            return;
        }

        try {
            setIsTransferLoading(true);

            const response =
                await fetch(
                    `${API_BASE_URL}/property-transfer-requests`,
                    {
                        method: "GET",
                        headers: {
                            Authorization:
                                `Bearer ${token}`,
                        },
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                if (
                    response.status ===
                    401
                ) {
                    clearAuthData();

                    navigate("/login", {
                        replace: true,
                    });

                    return;
                }

                throw new Error(
                    data.message ||
                    "Failed to load transfer requests"
                );
            }

            setTransferRequests(
                data.transfer_requests || []
            );
        } catch (err) {
            console.error(
                "Transfer request loading error:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load transfer requests"
            );
        } finally {
            setIsTransferLoading(false);
        }
    }

    /*
     * --------------------------------------------------------------------------
     * REFRESH EVERYTHING
     * --------------------------------------------------------------------------
     */

    async function refreshDashboard() {
        await Promise.all([
            loadRegistrations(),
            loadTransferRequests(),
        ]);
    }

    /*
     * --------------------------------------------------------------------------
     * LOGOUT
     * --------------------------------------------------------------------------
     */

    function handleLogout() {
        clearAuthData();

        navigate("/login", {
            replace: true,
        });
    }

    /*
     * --------------------------------------------------------------------------
     * INITIAL LOAD
     * --------------------------------------------------------------------------
     */

    useEffect(() => {
        const currentUser =
            getAuthUser();

        if (!currentUser) {
            navigate("/login", {
                replace: true,
            });

            return;
        }

        if (
            currentUser.role !==
            "GOVERNMENT_OFFICER"
        ) {
            navigate("/dashboard", {
                replace: true,
            });

            return;
        }

        void refreshDashboard();
    }, [navigate]);

    /*
     * --------------------------------------------------------------------------
     * REGISTRATION STATISTICS
     * --------------------------------------------------------------------------
     */

    const statistics = useMemo(() => {
        const pending =
            registrations.filter(
                (item) =>
                    item.status ===
                    "PENDING"
            ).length;

        const approved =
            registrations.filter(
                (item) =>
                    item.status ===
                    "APPROVED"
            ).length;

        const rejected =
            registrations.filter(
                (item) =>
                    item.status ===
                    "REJECTED"
            ).length;

        return {
            total: registrations.length,
            pending,
            approved,
            rejected,
        };
    }, [registrations]);

    /*
     * --------------------------------------------------------------------------
     * TRANSFER STATISTICS
     * --------------------------------------------------------------------------
     */

    const transferStatistics =
        useMemo(() => {
            const pending =
                transferRequests.filter(
                    (item) =>
                        item.status ===
                        "PENDING"
                ).length;

            const approved =
                transferRequests.filter(
                    (item) =>
                        item.status ===
                        "APPROVED"
                ).length;

            const rejected =
                transferRequests.filter(
                    (item) =>
                        item.status ===
                        "REJECTED"
                ).length;

            return {
                total:
                    transferRequests.length,
                pending,
                approved,
                rejected,
            };
        }, [transferRequests]);

    /*
     * --------------------------------------------------------------------------
     * FILTER REGISTRATIONS
     * --------------------------------------------------------------------------
     */

    const filteredRegistrations =
        useMemo(() => {
            if (
                activeFilter ===
                "ALL"
            ) {
                return registrations;
            }

            return registrations.filter(
                (item) =>
                    item.status ===
                    activeFilter
            );
        }, [
            registrations,
            activeFilter,
        ]);

    /*
     * --------------------------------------------------------------------------
     * FILTER TRANSFERS
     * --------------------------------------------------------------------------
     */

    const filteredTransfers =
        useMemo(() => {
            if (
                transferFilter ===
                "ALL"
            ) {
                return transferRequests;
            }

            return transferRequests.filter(
                (item) =>
                    item.status ===
                    transferFilter
            );
        }, [
            transferRequests,
            transferFilter,
        ]);

    /*
     * --------------------------------------------------------------------------
     * OPEN REGISTRATION REVIEW
     * --------------------------------------------------------------------------
     */

    function openReview(
        registration: Registration
    ) {
        setSelectedRegistration(
            registration
        );

        setSelectedTransfer(null);

        setReviewRemarks(
            registration.remarks || ""
        );

        setError("");
        setSuccess("");
    }

    /*
     * --------------------------------------------------------------------------
     * OPEN TRANSFER REVIEW
     * --------------------------------------------------------------------------
     */

    function openTransferReview(
        transfer: TransferRequest
    ) {
        setSelectedTransfer(
            transfer
        );

        setSelectedRegistration(null);

        setReviewRemarks(
            transfer.remarks || ""
        );

        setError("");
        setSuccess("");
    }

    /*
     * --------------------------------------------------------------------------
     * CLOSE REGISTRATION REVIEW
     * --------------------------------------------------------------------------
     */

    function closeReview() {
        if (isProcessing) {
            return;
        }

        setSelectedRegistration(
            null
        );

        setReviewRemarks("");
    }

    /*
     * --------------------------------------------------------------------------
     * CLOSE TRANSFER REVIEW
     * --------------------------------------------------------------------------
     */

    function closeTransferReview() {
        if (isProcessing) {
            return;
        }

        setSelectedTransfer(null);

        setReviewRemarks("");
    }

    /*
     * --------------------------------------------------------------------------
     * APPROVE REGISTRATION
     * --------------------------------------------------------------------------
     */

    async function approveRegistration() {
        if (!selectedRegistration) {
            return;
        }

        const token = getAuthToken();

        if (!token) {
            clearAuthData();

            navigate("/login", {
                replace: true,
            });

            return;
        }

        try {
            setIsProcessing(true);
            setError("");
            setSuccess("");

            const response =
                await fetch(
                    `${API_BASE_URL}/property-registrations/${selectedRegistration.id}/approve`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`,
                        },

                        body: JSON.stringify({
                            remarks:
                                reviewRemarks.trim(),
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                if (
                    response.status ===
                    401
                ) {
                    clearAuthData();

                    navigate("/login", {
                        replace: true,
                    });

                    return;
                }

                throw new Error(
                    data.message ||
                    "Failed to approve registration"
                );
            }

            setSuccess(
                `Registration approved successfully. Registration number: ${
                    data.registration
                        ?.registration_number ||
                    "Generated"
                }`
            );

            setSelectedRegistration(
                null
            );

            setReviewRemarks("");

            await loadRegistrations();
        } catch (err) {
            console.error(
                "Registration approval error:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to approve registration"
            );
        } finally {
            setIsProcessing(false);
        }
    }

    /*
     * --------------------------------------------------------------------------
     * REJECT REGISTRATION
     * --------------------------------------------------------------------------
     */

    async function rejectRegistration() {
        if (!selectedRegistration) {
            return;
        }

        const token = getAuthToken();

        if (!token) {
            clearAuthData();

            navigate("/login", {
                replace: true,
            });

            return;
        }

        const cleanRemarks =
            reviewRemarks.trim();

        if (!cleanRemarks) {
            setError(
                "Remarks are required when rejecting a registration."
            );

            return;
        }

        try {
            setIsProcessing(true);
            setError("");
            setSuccess("");

            const response =
                await fetch(
                    `${API_BASE_URL}/property-registrations/${selectedRegistration.id}/reject`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`,
                        },

                        body: JSON.stringify({
                            remarks:
                                cleanRemarks,
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                if (
                    response.status ===
                    401
                ) {
                    clearAuthData();

                    navigate("/login", {
                        replace: true,
                    });

                    return;
                }

                throw new Error(
                    data.message ||
                    "Failed to reject registration"
                );
            }

            setSuccess(
                "Registration request rejected successfully."
            );

            setSelectedRegistration(
                null
            );

            setReviewRemarks("");

            await loadRegistrations();
        } catch (err) {
            console.error(
                "Registration rejection error:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to reject registration"
            );
        } finally {
            setIsProcessing(false);
        }
    }

    /*
     * --------------------------------------------------------------------------
     * APPROVE TRANSFER
     * --------------------------------------------------------------------------
     */

    async function approveTransfer() {
        if (!selectedTransfer) {
            return;
        }

        const token = getAuthToken();

        if (!token) {
            clearAuthData();

            navigate("/login", {
                replace: true,
            });

            return;
        }

        try {
            setIsProcessing(true);
            setError("");
            setSuccess("");

            const response =
                await fetch(
                    `${API_BASE_URL}/property-transfer-requests/${selectedTransfer.id}/approve`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`,
                        },

                        body: JSON.stringify({
                            remarks:
                                reviewRemarks.trim(),
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                if (
                    response.status ===
                    401
                ) {
                    clearAuthData();

                    navigate("/login", {
                        replace: true,
                    });

                    return;
                }

                throw new Error(
                    data.message ||
                    "Failed to approve transfer request"
                );
            }

            setSuccess(
                "Property transfer approved successfully. Ownership has been transferred."
            );

            setSelectedTransfer(null);

            setReviewRemarks("");

            await loadTransferRequests();
        } catch (err) {
            console.error(
                "Transfer approval error:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to approve transfer request"
            );
        } finally {
            setIsProcessing(false);
        }
    }

    /*
     * --------------------------------------------------------------------------
     * REJECT TRANSFER
     * --------------------------------------------------------------------------
     */

    async function rejectTransfer() {
        if (!selectedTransfer) {
            return;
        }

        const token = getAuthToken();

        if (!token) {
            clearAuthData();

            navigate("/login", {
                replace: true,
            });

            return;
        }

        const cleanRemarks =
            reviewRemarks.trim();

        if (!cleanRemarks) {
            setError(
                "Remarks are required when rejecting a transfer request."
            );

            return;
        }

        try {
            setIsProcessing(true);
            setError("");
            setSuccess("");

            const response =
                await fetch(
                    `${API_BASE_URL}/property-transfer-requests/${selectedTransfer.id}/reject`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`,
                        },

                        body: JSON.stringify({
                            remarks:
                                cleanRemarks,
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                if (
                    response.status ===
                    401
                ) {
                    clearAuthData();

                    navigate("/login", {
                        replace: true,
                    });

                    return;
                }

                throw new Error(
                    data.message ||
                    "Failed to reject transfer request"
                );
            }

            setSuccess(
                "Property transfer request rejected successfully."
            );

            setSelectedTransfer(null);

            setReviewRemarks("");

            await loadTransferRequests();
        } catch (err) {
            console.error(
                "Transfer rejection error:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to reject transfer request"
            );
        } finally {
            setIsProcessing(false);
        }
    }

    /*
     * --------------------------------------------------------------------------
     * FORMAT DATE
     * --------------------------------------------------------------------------
     */

    function formatDate(
        value: string | null
    ) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return "—";
        }

        return date.toLocaleString(
            "en-IN",
            {
                dateStyle: "medium",
                timeStyle: "short",
            }
        );
    }

    /*
     * --------------------------------------------------------------------------
     * STATUS LABEL
     * --------------------------------------------------------------------------
     */

    function statusLabel(
        status:
            | RegistrationStatus
            | TransferStatus
    ) {
        switch (status) {
            case "PENDING":
                return "Pending";

            case "APPROVED":
                return "Approved";

            case "REJECTED":
                return "Rejected";

            default:
                return status;
        }
    }

    /*
     * --------------------------------------------------------------------------
     * OWNERSHIP LABEL
     * --------------------------------------------------------------------------
     */

    function ownershipLabel(
        registration: Registration
    ) {
        if (
            !registration.owner_id ||
            !registration.ownership_id
        ) {
            return "Unassigned";
        }

        if (
            registration.ownership_percentage ===
            null
        ) {
            return "Ownership linked";
        }

        return `${registration.ownership_percentage}% ownership`;
    }

    /*
     * --------------------------------------------------------------------------
     * RENDER
     * --------------------------------------------------------------------------
     */

    return (
        <div className="gov-dashboard">

            {/* ================================================================
                HEADER
            ================================================================= */}

            <header className="gov-dashboard-header">

                <div>
                    <div className="gov-eyebrow">
                        3D ULPIN • PROPERTY
                        ADMINISTRATION
                    </div>

                    <h1>
                        Government Officer
                        Dashboard
                    </h1>

                    <p>
                        Review, verify and manage
                        digital property registration
                        and ownership transfer requests.
                    </p>
                </div>

                <div className="gov-officer-card">

                    <div className="gov-officer-avatar">
                        {(user?.name ||
                            "GO")
                            .slice(0, 2)
                            .toUpperCase()}
                    </div>

                    <div className="gov-officer-info">
                        <strong>
                            {user?.name ||
                                "Government Officer"}
                        </strong>

                        <span>
                            Government Officer
                        </span>
                    </div>

                    <button
                        type="button"
                        className="gov-logout-button"
                        onClick={
                            handleLogout
                        }
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

            {/* ================================================================
                GLOBAL MESSAGES
            ================================================================= */}

            {error && (
                <div className="gov-alert gov-alert-error">
                    <span>!</span>

                    {error}
                </div>
            )}

            {success && (
                <div className="gov-alert gov-alert-success">
                    <span>✓</span>

                    {success}
                </div>
            )}

            {/* ================================================================
                REGISTRATION STATISTICS
            ================================================================= */}

            <section className="gov-stat-grid">

                <button
                    type="button"
                    className="gov-stat-card"
                    onClick={() =>
                        setActiveFilter(
                            "ALL"
                        )
                    }
                >
                    <div className="gov-stat-icon">
                        ▦
                    </div>

                    <div>
                        <span>
                            Registration Requests
                        </span>

                        <strong>
                            {statistics.total}
                        </strong>
                    </div>
                </button>

                <button
                    type="button"
                    className="gov-stat-card gov-stat-pending"
                    onClick={() =>
                        setActiveFilter(
                            "PENDING"
                        )
                    }
                >
                    <div className="gov-stat-icon">
                        ⏳
                    </div>

                    <div>
                        <span>
                            Pending Registration
                        </span>

                        <strong>
                            {statistics.pending}
                        </strong>
                    </div>
                </button>

                <button
                    type="button"
                    className="gov-stat-card gov-stat-approved"
                    onClick={() =>
                        setActiveFilter(
                            "APPROVED"
                        )
                    }
                >
                    <div className="gov-stat-icon">
                        ✓
                    </div>

                    <div>
                        <span>
                            Approved
                        </span>

                        <strong>
                            {statistics.approved}
                        </strong>
                    </div>
                </button>

                <button
                    type="button"
                    className="gov-stat-card gov-stat-rejected"
                    onClick={() =>
                        setActiveFilter(
                            "REJECTED"
                        )
                    }
                >
                    <div className="gov-stat-icon">
                        ×
                    </div>

                    <div>
                        <span>
                            Rejected
                        </span>

                        <strong>
                            {statistics.rejected}
                        </strong>
                    </div>
                </button>

            </section>

            {/* ================================================================
                REGISTRATION REQUESTS
            ================================================================= */}

            <section className="gov-panel">

                <div className="gov-panel-header">

                    <div>
                        <h2>
                            Property Registration
                            Requests
                        </h2>

                        <p>
                            Review and process
                            submitted property records.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="gov-refresh-button"
                        onClick={() =>
                            void refreshDashboard()
                        }
                        disabled={
                            isLoading ||
                            isTransferLoading
                        }
                    >
                        ↻ Refresh
                    </button>

                </div>

                <div className="gov-filters">

                    {(
                        [
                            ["ALL", "All"],
                            [
                                "PENDING",
                                "Pending",
                            ],
                            [
                                "APPROVED",
                                "Approved",
                            ],
                            [
                                "REJECTED",
                                "Rejected",
                            ],
                        ] as [
                            FilterType,
                            string
                        ][]
                    ).map(
                        ([
                            value,
                            label,
                        ]) => (
                            <button
                                type="button"
                                key={value}
                                className={
                                    activeFilter ===
                                    value
                                        ? "gov-filter active"
                                        : "gov-filter"
                                }
                                onClick={() =>
                                    setActiveFilter(
                                        value
                                    )
                                }
                            >
                                {label}

                                <span>
                                    {value ===
                                    "ALL"
                                        ? statistics.total
                                        : value ===
                                            "PENDING"
                                            ? statistics.pending
                                            : value ===
                                                "APPROVED"
                                                ? statistics.approved
                                                : statistics.rejected}
                                </span>
                            </button>
                        )
                    )}

                </div>

                {isLoading ? (
                    <div className="gov-empty">
                        <div className="gov-spinner" />

                        <p>
                            Loading registration
                            requests...
                        </p>
                    </div>
                ) : filteredRegistrations.length ===
                    0 ? (
                    <div className="gov-empty">

                        <div className="gov-empty-icon">
                            ✓
                        </div>

                        <h3>
                            No requests found
                        </h3>

                        <p>
                            There are no registration
                            requests in this category.
                        </p>

                    </div>
                ) : (
                    <div className="gov-table-wrapper">

                        <table className="gov-table">

                            <thead>
                                <tr>

                                    <th>
                                        Property
                                    </th>

                                    <th>
                                        VPID
                                    </th>

                                    <th>
                                        Owner
                                    </th>

                                    <th>
                                        Ownership
                                    </th>

                                    <th>
                                        Submitted
                                    </th>

                                    <th>
                                        Status
                                    </th>

                                    <th>
                                        Action
                                    </th>

                                </tr>
                            </thead>

                            <tbody>

                                {filteredRegistrations.map(
                                    (
                                        registration
                                    ) => (
                                        <tr
                                            key={
                                                registration.id
                                            }
                                        >

                                            <td>
                                                <div className="gov-property-cell">

                                                    <strong>
                                                        Unit{" "}
                                                        {
                                                            registration.unit_number
                                                        }
                                                    </strong>

                                                    <span>
                                                        {
                                                            registration.building_name
                                                        }
                                                        {" • "}
                                                        {
                                                            registration.floor_label
                                                        }
                                                    </span>

                                                </div>
                                            </td>

                                            <td>
                                                <code>
                                                    {
                                                        registration.vertical_property_id
                                                    }
                                                </code>
                                            </td>

                                            <td>
                                                <div className="gov-owner-table-cell">

                                                    <strong>
                                                        {
                                                            registration.owner_name ||
                                                            "Unassigned"
                                                        }
                                                    </strong>

                                                    {registration.owner_contact && (
                                                        <span>
                                                            {
                                                                registration.owner_contact
                                                            }
                                                        </span>
                                                    )}

                                                </div>
                                            </td>

                                            <td>
                                                <span>
                                                    {ownershipLabel(
                                                        registration
                                                    )}
                                                </span>
                                            </td>

                                            <td>
                                                {formatDate(
                                                    registration.submitted_at
                                                )}
                                            </td>

                                            <td>
                                                <span
                                                    className={`gov-status gov-status-${registration.status.toLowerCase()}`}
                                                >
                                                    <i />

                                                    {
                                                        statusLabel(
                                                            registration.status
                                                        )
                                                    }
                                                </span>
                                            </td>

                                            <td>
                                                <button
                                                    type="button"
                                                    className="gov-review-button"
                                                    onClick={() =>
                                                        openReview(
                                                            registration
                                                        )
                                                    }
                                                >
                                                    {registration.status ===
                                                    "PENDING"
                                                        ? "Review"
                                                        : "View"}

                                                    <span>
                                                        →
                                                    </span>
                                                </button>
                                            </td>

                                        </tr>
                                    )
                                )}

                            </tbody>

                        </table>

                    </div>
                )}

            </section>

            {/* ================================================================
                TRANSFER STATISTICS
            ================================================================= */}

            <section className="gov-stat-grid">

                <button
                    type="button"
                    className="gov-stat-card"
                    onClick={() =>
                        setTransferFilter(
                            "ALL"
                        )
                    }
                >
                    <div className="gov-stat-icon">
                        ⇄
                    </div>

                    <div>
                        <span>
                            Transfer Requests
                        </span>

                        <strong>
                            {transferStatistics.total}
                        </strong>
                    </div>
                </button>

                <button
                    type="button"
                    className="gov-stat-card gov-stat-pending"
                    onClick={() =>
                        setTransferFilter(
                            "PENDING"
                        )
                    }
                >
                    <div className="gov-stat-icon">
                        ⏳
                    </div>

                    <div>
                        <span>
                            Pending Transfers
                        </span>

                        <strong>
                            {transferStatistics.pending}
                        </strong>
                    </div>
                </button>

                <button
                    type="button"
                    className="gov-stat-card gov-stat-approved"
                    onClick={() =>
                        setTransferFilter(
                            "APPROVED"
                        )
                    }
                >
                    <div className="gov-stat-icon">
                        ✓
                    </div>

                    <div>
                        <span>
                            Approved Transfers
                        </span>

                        <strong>
                            {transferStatistics.approved}
                        </strong>
                    </div>
                </button>

                <button
                    type="button"
                    className="gov-stat-card gov-stat-rejected"
                    onClick={() =>
                        setTransferFilter(
                            "REJECTED"
                        )
                    }
                >
                    <div className="gov-stat-icon">
                        ×
                    </div>

                    <div>
                        <span>
                            Rejected Transfers
                        </span>

                        <strong>
                            {transferStatistics.rejected}
                        </strong>
                    </div>
                </button>

            </section>

            {/* ================================================================
                TRANSFER REQUESTS
            ================================================================= */}

            <section className="gov-panel">

                <div className="gov-panel-header">

                    <div>
                        <h2>
                            Property Transfer
                            Requests
                        </h2>

                        <p>
                            Review ownership transfer
                            requests submitted by citizens.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="gov-refresh-button"
                        onClick={() =>
                            void loadTransferRequests()
                        }
                        disabled={
                            isTransferLoading
                        }
                    >
                        ↻ Refresh Transfers
                    </button>

                </div>

                {/* Transfer filters */}

                <div className="gov-filters">

                    {(
                        [
                            ["ALL", "All"],
                            [
                                "PENDING",
                                "Pending",
                            ],
                            [
                                "APPROVED",
                                "Approved",
                            ],
                            [
                                "REJECTED",
                                "Rejected",
                            ],
                        ] as [
                            TransferFilterType,
                            string
                        ][]
                    ).map(
                        ([
                            value,
                            label,
                        ]) => (
                            <button
                                type="button"
                                key={value}
                                className={
                                    transferFilter ===
                                    value
                                        ? "gov-filter active"
                                        : "gov-filter"
                                }
                                onClick={() =>
                                    setTransferFilter(
                                        value
                                    )
                                }
                            >
                                {label}

                                <span>
                                    {value ===
                                    "ALL"
                                        ? transferStatistics.total
                                        : value ===
                                            "PENDING"
                                            ? transferStatistics.pending
                                            : value ===
                                                "APPROVED"
                                                ? transferStatistics.approved
                                                : transferStatistics.rejected}
                                </span>
                            </button>
                        )
                    )}

                </div>

                {isTransferLoading ? (
                    <div className="gov-empty">

                        <div className="gov-spinner" />

                        <p>
                            Loading transfer
                            requests...
                        </p>

                    </div>
                ) : filteredTransfers.length ===
                    0 ? (
                    <div className="gov-empty">

                        <div className="gov-empty-icon">
                            ✓
                        </div>

                        <h3>
                            No transfer requests
                        </h3>

                        <p>
                            There are no ownership
                            transfer requests in this category.
                        </p>

                    </div>
                ) : (
                    <div className="gov-table-wrapper">

                        <table className="gov-table">

                            <thead>
                                <tr>

                                    <th>
                                        Property
                                    </th>

                                    <th>
                                        VPID
                                    </th>

                                    <th>
                                        Current Owner
                                    </th>

                                    <th>
                                        New Owner
                                    </th>

                                    <th>
                                        Transfer Date
                                    </th>

                                    <th>
                                        Status
                                    </th>

                                    <th>
                                        Action
                                    </th>

                                </tr>
                            </thead>

                            <tbody>

                                {filteredTransfers.map(
                                    (
                                        transfer
                                    ) => (
                                        <tr
                                            key={
                                                transfer.id
                                            }
                                        >

                                            <td>
                                                <div className="gov-property-cell">

                                                    <strong>
                                                        Unit{" "}
                                                        {
                                                            transfer.unit_number
                                                        }
                                                    </strong>

                                                    <span>
                                                        {
                                                            transfer.building_name
                                                        }
                                                        {" • "}
                                                        {
                                                            transfer.floor_label
                                                        }
                                                    </span>

                                                </div>
                                            </td>

                                            <td>
                                                <code>
                                                    {
                                                        transfer.vertical_property_id
                                                    }
                                                </code>
                                            </td>

                                            <td>
                                                <div className="gov-owner-table-cell">

                                                    <strong>
                                                        {
                                                            transfer.current_owner_name
                                                        }
                                                    </strong>

                                                    {transfer.current_owner_contact && (
                                                        <span>
                                                            {
                                                                transfer.current_owner_contact
                                                            }
                                                        </span>
                                                    )}

                                                </div>
                                            </td>

                                            <td>
                                                <div className="gov-owner-table-cell">

                                                    <strong>
                                                        {
                                                            transfer.new_owner_name
                                                        }
                                                    </strong>

                                                    {transfer.new_owner_contact && (
                                                        <span>
                                                            {
                                                                transfer.new_owner_contact
                                                            }
                                                        </span>
                                                    )}

                                                </div>
                                            </td>

                                            <td>
                                                {formatDate(
                                                    transfer.transfer_date
                                                )}
                                            </td>

                                            <td>
                                                <span
                                                    className={`gov-status gov-status-${transfer.status.toLowerCase()}`}
                                                >
                                                    <i />

                                                    {
                                                        statusLabel(
                                                            transfer.status
                                                        )
                                                    }
                                                </span>
                                            </td>

                                            <td>
                                                <button
                                                    type="button"
                                                    className="gov-review-button"
                                                    onClick={() =>
                                                        openTransferReview(
                                                            transfer
                                                        )
                                                    }
                                                >
                                                    {transfer.status ===
                                                    "PENDING"
                                                        ? "Review"
                                                        : "View"}

                                                    <span>
                                                        →
                                                    </span>
                                                </button>
                                            </td>

                                        </tr>
                                    )
                                )}

                            </tbody>

                        </table>

                    </div>
                )}

            </section>

            {/* ================================================================
                REGISTRATION REVIEW MODAL
            ================================================================= */}

            {selectedRegistration && (
                <div
                    className="gov-modal-backdrop"
                    onMouseDown={(
                        event
                    ) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            closeReview();
                        }
                    }}
                >

                    <div className="gov-modal">

                        <div className="gov-modal-header">

                            <div>
                                <span>
                                    PROPERTY REGISTRATION
                                </span>

                                <h2>
                                    Review Request
                                </h2>
                            </div>

                            <button
                                type="button"
                                className="gov-close-button"
                                onClick={
                                    closeReview
                                }
                                disabled={
                                    isProcessing
                                }
                            >
                                ×
                            </button>

                        </div>

                        <div className="gov-vpid-card">

                            <span>
                                VERTICAL PROPERTY
                                IDENTIFIER
                            </span>

                            <strong>
                                {
                                    selectedRegistration.vertical_property_id
                                }
                            </strong>

                            <small>
                                ULPIN:{" "}
                                {
                                    selectedRegistration.parent_ulpin
                                }
                            </small>

                        </div>

                        <div className="gov-detail-grid">

                            <div>
                                <span>
                                    Building
                                </span>

                                <strong>
                                    {
                                        selectedRegistration.building_name
                                    }
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Floor
                                </span>

                                <strong>
                                    {
                                        selectedRegistration.floor_label
                                    }
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Unit
                                </span>

                                <strong>
                                    {
                                        selectedRegistration.unit_number
                                    }
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Status
                                </span>

                                <strong>
                                    <span
                                        className={`gov-status gov-status-${selectedRegistration.status.toLowerCase()}`}
                                    >
                                        <i />

                                        {
                                            statusLabel(
                                                selectedRegistration.status
                                            )
                                        }
                                    </span>
                                </strong>
                            </div>

                        </div>

                        <div className="gov-section">

                            <h3>
                                Ownership
                            </h3>

                            <div className="gov-owner-card">

                                <div className="gov-owner-avatar">
                                    {(
                                        selectedRegistration
                                            .owner_name ||
                                        "NA"
                                    )
                                        .slice(
                                            0,
                                            2
                                        )
                                        .toUpperCase()}
                                </div>

                                <div>
                                    <strong>
                                        {
                                            selectedRegistration.owner_name ||
                                            "No owner assigned"
                                        }
                                    </strong>

                                    <span>
                                        {
                                            selectedRegistration.owner_contact ||
                                            "Owner information not provided"
                                        }
                                    </span>
                                </div>

                                {selectedRegistration.ownership_percentage !==
                                    null && (
                                    <div className="gov-owner-percentage">
                                        {
                                            selectedRegistration.ownership_percentage
                                        }
                                        %
                                    </div>
                                )}

                            </div>

                            <div className="gov-submission-grid">

                                <div>
                                    <span>
                                        Owner ID
                                    </span>

                                    <strong>
                                        {selectedRegistration.owner_id ||
                                            "—"}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Ownership ID
                                    </span>

                                    <strong>
                                        {selectedRegistration.ownership_id ||
                                            "—"}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Ownership %
                                    </span>

                                    <strong>
                                        {selectedRegistration.ownership_percentage !==
                                        null
                                            ? `${selectedRegistration.ownership_percentage}%`
                                            : "—"}
                                    </strong>
                                </div>

                            </div>

                        </div>

                        <div className="gov-section">

                            <h3>
                                Submission Details
                            </h3>

                            <div className="gov-submission-grid">

                                <div>
                                    <span>
                                        Submitted by
                                    </span>

                                    <strong>
                                        {
                                            selectedRegistration.submitted_by_name ||
                                            "Unknown"
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Submitted
                                    </span>

                                    <strong>
                                        {formatDate(
                                            selectedRegistration.submitted_at
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Registration Number
                                    </span>

                                    <strong>
                                        {
                                            selectedRegistration.registration_number ||
                                            "Not generated"
                                        }
                                    </strong>
                                </div>

                            </div>

                        </div>

                        {(selectedRegistration.reviewed_by_name ||
                            selectedRegistration.reviewed_at) && (
                            <div className="gov-section">

                                <h3>
                                    Review Details
                                </h3>

                                <div className="gov-submission-grid">

                                    <div>
                                        <span>
                                            Reviewed by
                                        </span>

                                        <strong>
                                            {
                                                selectedRegistration.reviewed_by_name ||
                                                "Unknown"
                                            }
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Reviewed
                                        </span>

                                        <strong>
                                            {formatDate(
                                                selectedRegistration.reviewed_at
                                            )}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Final Status
                                        </span>

                                        <strong>
                                            <span
                                                className={`gov-status gov-status-${selectedRegistration.status.toLowerCase()}`}
                                            >
                                                <i />

                                                {
                                                    statusLabel(
                                                        selectedRegistration.status
                                                    )
                                                }
                                            </span>
                                        </strong>
                                    </div>

                                </div>

                            </div>
                        )}

                        <div className="gov-section">

                            <h3>
                                Property Identifiers
                            </h3>

                            <div className="gov-submission-grid">

                                <div>
                                    <span>
                                        Property Unit ID
                                    </span>

                                    <strong>
                                        {
                                            selectedRegistration.property_unit_id
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Building ID
                                    </span>

                                    <strong>
                                        {
                                            selectedRegistration.building_id
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        ULPIN
                                    </span>

                                    <strong>
                                        {
                                            selectedRegistration.parent_ulpin
                                        }
                                    </strong>
                                </div>

                            </div>

                        </div>

                        <div className="gov-section">

                            <label htmlFor="review-remarks">
                                Officer Remarks
                            </label>

                            <textarea
                                id="review-remarks"
                                value={
                                    reviewRemarks
                                }
                                onChange={(
                                    event
                                ) =>
                                    setReviewRemarks(
                                        event.target.value
                                    )
                                }
                                placeholder={
                                    selectedRegistration.status ===
                                    "PENDING"
                                        ? "Enter verification remarks..."
                                        : "Review remarks..."
                                }
                                disabled={
                                    selectedRegistration.status !==
                                        "PENDING" ||
                                    isProcessing
                                }
                            />

                        </div>

                        {selectedRegistration.status ===
                        "PENDING" ? (
                            <div className="gov-modal-actions">

                                <button
                                    type="button"
                                    className="gov-reject-button"
                                    onClick={() =>
                                        void rejectRegistration()
                                    }
                                    disabled={
                                        isProcessing
                                    }
                                >
                                    {isProcessing
                                        ? "Processing..."
                                        : "Reject Request"}
                                </button>

                                <button
                                    type="button"
                                    className="gov-approve-button"
                                    onClick={() =>
                                        void approveRegistration()
                                    }
                                    disabled={
                                        isProcessing
                                    }
                                >
                                    {isProcessing
                                        ? "Processing..."
                                        : "✓ Approve Registration"}
                                </button>

                            </div>
                        ) : (
                            <div className="gov-modal-footer-status">
                                This registration request
                                has already been{" "}
                                <strong>
                                    {selectedRegistration.status.toLowerCase()}
                                </strong>
                                .
                            </div>
                        )}

                    </div>

                </div>
            )}

            {/* ================================================================
                TRANSFER REVIEW MODAL
            ================================================================= */}

            {selectedTransfer && (
                <div
                    className="gov-modal-backdrop"
                    onMouseDown={(
                        event
                    ) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            closeTransferReview();
                        }
                    }}
                >

                    <div className="gov-modal">

                        <div className="gov-modal-header">

                            <div>
                                <span>
                                    OWNERSHIP TRANSFER
                                </span>

                                <h2>
                                    Review Transfer Request
                                </h2>
                            </div>

                            <button
                                type="button"
                                className="gov-close-button"
                                onClick={
                                    closeTransferReview
                                }
                                disabled={
                                    isProcessing
                                }
                            >
                                ×
                            </button>

                        </div>

                        {/* VPID */}

                        <div className="gov-vpid-card">

                            <span>
                                VERTICAL PROPERTY
                                IDENTIFIER
                            </span>

                            <strong>
                                {
                                    selectedTransfer.vertical_property_id
                                }
                            </strong>

                            <small>
                                ULPIN:{" "}
                                {
                                    selectedTransfer.parent_ulpin
                                }
                            </small>

                        </div>

                        {/* Property details */}

                        <div className="gov-detail-grid">

                            <div>
                                <span>
                                    Building
                                </span>

                                <strong>
                                    {
                                        selectedTransfer.building_name
                                    }
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Floor
                                </span>

                                <strong>
                                    {
                                        selectedTransfer.floor_label
                                    }
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Unit
                                </span>

                                <strong>
                                    {
                                        selectedTransfer.unit_number
                                    }
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Transfer Date
                                </span>

                                <strong>
                                    {formatDate(
                                        selectedTransfer.transfer_date
                                    )}
                                </strong>
                            </div>

                        </div>

                        {/* Ownership transfer */}

                        <div className="gov-section">

                            <h3>
                                Ownership Transfer
                            </h3>

                            <div className="gov-detail-grid">

                                <div>
                                    <span>
                                        Current Owner
                                    </span>

                                    <strong>
                                        {
                                            selectedTransfer.current_owner_name
                                        }
                                    </strong>

                                    {selectedTransfer.current_owner_contact && (
                                        <small>
                                            {
                                                selectedTransfer.current_owner_contact
                                            }
                                        </small>
                                    )}
                                </div>

                                <div>
                                    <span>
                                        New Owner
                                    </span>

                                    <strong>
                                        {
                                            selectedTransfer.new_owner_name
                                        }
                                    </strong>

                                    {selectedTransfer.new_owner_contact && (
                                        <small>
                                            {
                                                selectedTransfer.new_owner_contact
                                            }
                                        </small>
                                    )}
                                </div>

                                <div>
                                    <span>
                                        Ownership
                                    </span>

                                    <strong>
                                        {
                                            selectedTransfer.ownership_percentage
                                        }
                                        %
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Status
                                    </span>

                                    <strong>
                                        <span
                                            className={`gov-status gov-status-${selectedTransfer.status.toLowerCase()}`}
                                        >
                                            <i />

                                            {
                                                statusLabel(
                                                    selectedTransfer.status
                                                )
                                            }
                                        </span>
                                    </strong>
                                </div>

                            </div>

                        </div>

                        {/* Request details */}

                        <div className="gov-section">

                            <h3>
                                Request Details
                            </h3>

                            <div className="gov-submission-grid">

                                <div>
                                    <span>
                                        Submitted By
                                    </span>

                                    <strong>
                                        {
                                            selectedTransfer.submitted_by_name ||
                                            "Unknown"
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Submitted
                                    </span>

                                    <strong>
                                        {formatDate(
                                            selectedTransfer.submitted_at
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Request ID
                                    </span>

                                    <strong>
                                        {
                                            selectedTransfer.id
                                        }
                                    </strong>
                                </div>

                            </div>

                        </div>

                        {/* Review details */}

                        {(selectedTransfer.reviewed_by_name ||
                            selectedTransfer.reviewed_at) && (
                            <div className="gov-section">

                                <h3>
                                    Review Details
                                </h3>

                                <div className="gov-submission-grid">

                                    <div>
                                        <span>
                                            Reviewed By
                                        </span>

                                        <strong>
                                            {
                                                selectedTransfer.reviewed_by_name ||
                                                "Unknown"
                                            }
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Reviewed
                                        </span>

                                        <strong>
                                            {formatDate(
                                                selectedTransfer.reviewed_at
                                            )}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            Final Status
                                        </span>

                                        <strong>
                                            <span
                                                className={`gov-status gov-status-${selectedTransfer.status.toLowerCase()}`}
                                            >
                                                <i />

                                                {
                                                    statusLabel(
                                                        selectedTransfer.status
                                                    )
                                                }
                                            </span>
                                        </strong>
                                    </div>

                                </div>

                            </div>
                        )}

                        {/* Remarks */}

                        <div className="gov-section">

                            <label htmlFor="transfer-review-remarks">
                                Officer Remarks
                            </label>

                            <textarea
                                id="transfer-review-remarks"
                                value={
                                    reviewRemarks
                                }
                                onChange={(
                                    event
                                ) =>
                                    setReviewRemarks(
                                        event.target.value
                                    )
                                }
                                placeholder={
                                    selectedTransfer.status ===
                                    "PENDING"
                                        ? "Enter transfer verification remarks..."
                                        : "Review remarks..."
                                }
                                disabled={
                                    selectedTransfer.status !==
                                        "PENDING" ||
                                    isProcessing
                                }
                            />

                        </div>

                        {/* Actions */}

                        {selectedTransfer.status ===
                        "PENDING" ? (
                            <div className="gov-modal-actions">

                                <button
                                    type="button"
                                    className="gov-reject-button"
                                    onClick={() =>
                                        void rejectTransfer()
                                    }
                                    disabled={
                                        isProcessing
                                    }
                                >
                                    {isProcessing
                                        ? "Processing..."
                                        : "Reject Transfer"}
                                </button>

                                <button
                                    type="button"
                                    className="gov-approve-button"
                                    onClick={() =>
                                        void approveTransfer()
                                    }
                                    disabled={
                                        isProcessing
                                    }
                                >
                                    {isProcessing
                                        ? "Processing..."
                                        : "✓ Approve Transfer"}
                                </button>

                            </div>
                        ) : (
                            <div className="gov-modal-footer-status">
                                This transfer request
                                has already been{" "}
                                <strong>
                                    {selectedTransfer.status.toLowerCase()}
                                </strong>
                                .
                            </div>
                        )}

                    </div>

                </div>
            )}

        </div>
    );
}

export default GovernmentOfficerDashboard;