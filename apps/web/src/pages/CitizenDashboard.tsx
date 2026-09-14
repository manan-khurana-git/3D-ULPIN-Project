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

type AvailablePropertyUnit = {
    id: string;
    floor_id: string;
    unit_number: string;
    parent_ulpin: string;
    vertical_property_id: string;
    area_sq_m: string | number;
    min_z: string | number;
    max_z: string | number;
    floor_number: number;
    floor_label: string;
    building_id: string;
    building_name: string;
    parcel_number: string;
    state?: string | null;
};

type AvailablePropertyResponse = {
    status: string;
    property_units: AvailablePropertyUnit[];
};

type AllPropertyUnitResponse = {
    status: string;
    property_units: AvailablePropertyUnit[];
};

type BuildingAddressResponse = {
    status?: string;
    building?: {
        id?: string;
        state?: string | null;
    };
    data?: {
        building?: {
            id?: string;
            state?: string | null;
        };
        state?: string | null;
    };
    state?: string | null;
};

type OwnershipHistoryRecord = {
    id: string;
    owner_id: string;
    name: string;
    contact: string | null;
    ownership_percentage: number;
    valid_from: string;
    valid_to: string | null;
    is_current: boolean;
};

type AuditTrailRecord = {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    property_unit_id: string;
    previous_status: string | null;
    new_status: string | null;
    remarks: string | null;
    metadata: Record<string, unknown>;
    created_at: string;

    actor: {
        id: string;
        name: string;
        email: string;
        role: string;
    } | null;
};

type PropertyHistoryResponse = {
    status: string;

    property: {
        id: string;
        vertical_property_id: string;
        parent_ulpin: string;
        unit_number: string;
        floor_number: number;
        floor_label: string;

        building: {
            id: string;
            name: string;
        };
    };

    current_owner: OwnershipHistoryRecord | null;

    ownership_history: OwnershipHistoryRecord[];

    audit_trail: AuditTrailRecord[];
};

const API_BASE_URL = "https://threed-ulpin-api.onrender.com/api";

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

function auditActionLabel(action: string) {
    switch (action) {
        case "CITIZEN_REGISTRATION_SUBMITTED":
            return "Registration Submitted";

        case "REGISTRATION_APPROVED":
            return "Registration Approved";

        case "REGISTRATION_REJECTED":
            return "Registration Rejected";

        case "TRANSFER_REQUEST_SUBMITTED":
            return "Transfer Request Submitted";

        case "TRANSFER_REQUEST_APPROVED":
            return "Transfer Request Approved";

        case "TRANSFER_REQUEST_REJECTED":
            return "Transfer Request Rejected";

        default:
            return action
                .replace(/_/g, " ")
                .toLowerCase()
                .replace(/\b\w/g, (letter) =>
                    letter.toUpperCase()
                );
    }
}

function isTransferredRegistration(
    registration: CitizenRegistration,
    currentOwnership: OwnershipHistoryRecord | null | undefined
) {
    return (
        registration.status === "APPROVED" &&
        !!registration.owner &&
        !!currentOwnership &&
        currentOwnership.owner_id !== registration.owner.id
    );
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

    const [currentOwnershipByPropertyUnitId, setCurrentOwnershipByPropertyUnitId] =
        useState<Record<string, OwnershipHistoryRecord | null>>({});

    const [propertyHistory, setPropertyHistory] =
        useState<PropertyHistoryResponse | null>(null);

    const [isLoadingHistory, setIsLoadingHistory] =
        useState(false);

    const [historyError, setHistoryError] =
        useState("");

    const [historyRegistration, setHistoryRegistration] =
        useState<CitizenRegistration | null>(null);

    const [transferRegistration, setTransferRegistration] =
        useState<CitizenRegistration | null>(null);

    const [transferOwnerName, setTransferOwnerName] =
        useState("");

    const [transferOwnerContact, setTransferOwnerContact] =
        useState("");

    const [transferOwnershipPercentage, setTransferOwnershipPercentage] =
        useState("100");

    const [transferDate, setTransferDate] =
        useState(
            new Date().toISOString().slice(0, 10)
        );

    const [transferError, setTransferError] =
        useState("");

    const [isSubmittingTransfer, setIsSubmittingTransfer] =
        useState(false);

    const [filter, setFilter] = useState<
        "ALL" | "PENDING" | "APPROVED" | "REJECTED"
    >("ALL");

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState("");

    const [availableProperties, setAvailableProperties] =
        useState<AvailablePropertyUnit[]>([]);

    const [allPropertyUnits, setAllPropertyUnits] =
        useState<AvailablePropertyUnit[]>([]);

    const [buildingStates, setBuildingStates] =
        useState<Record<string, string>>({});

    const [isLoadingAvailable, setIsLoadingAvailable] =
        useState(false);

    const [showAllAvailableProperties, setShowAllAvailableProperties] =
        useState(false);

    const [selectedAvailableBuildingId, setSelectedAvailableBuildingId] =
        useState<string | null>(null);

    const [selectedAvailableProperty, setSelectedAvailableProperty] =
        useState<AvailablePropertyUnit | null>(null);

    const [ownerContact, setOwnerContact] = useState("");

    const [ownershipPercentage, setOwnershipPercentage] =
        useState("100");

    const [registrationError, setRegistrationError] =
        useState("");

    const [isSubmittingRegistration, setIsSubmittingRegistration] =
        useState(false);

    const loadCurrentOwnerships = useCallback(
        async (
            propertyRegistrations: CitizenRegistration[],
            token: string
        ) => {
            const approvedRegistrations =
                propertyRegistrations.filter(
                    (registration) =>
                        registration.status === "APPROVED"
                );

            if (approvedRegistrations.length === 0) {
                setCurrentOwnershipByPropertyUnitId({});
                return;
            }

            const ownershipEntries = await Promise.all(
                approvedRegistrations.map(
                    async (registration) => {
                        try {
                            const response = await fetch(
                                `${API_BASE_URL}/property-units/${encodeURIComponent(
                                    registration.property.vertical_property_id
                                )}/history`,
                                {
                                    method: "GET",
                                    headers: {
                                        Authorization: `Bearer ${token}`,
                                    },
                                }
                            );

                            if (response.status === 401) {
                                clearAuthData();
                                navigate("/login", {
                                    replace: true,
                                });
                                return [
                                    registration.property_unit_id,
                                    null,
                                ] as const;
                            }

                            if (!response.ok) {
                                return [
                                    registration.property_unit_id,
                                    null,
                                ] as const;
                            }

                            const data =
                                (await response.json()) as PropertyHistoryResponse;

                            return [
                                registration.property_unit_id,
                                data.current_owner ?? null,
                            ] as const;
                        } catch (requestError) {
                            console.error(
                                `Current ownership loading error for ${registration.property.vertical_property_id}:`,
                                requestError
                            );

                            return [
                                registration.property_unit_id,
                                null,
                            ] as const;
                        }
                    }
                )
            );

            setCurrentOwnershipByPropertyUnitId(
                Object.fromEntries(ownershipEntries)
            );
        },
        [navigate]
    );

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
            setCurrentOwnershipByPropertyUnitId({});

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

                await loadCurrentOwnerships(
                    successData.registrations ?? [],
                    token
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
        [loadCurrentOwnerships, navigate]
    );

    const loadAvailableProperties = useCallback(async () => {
        const token = getAuthToken();

        if (!token) {
            clearAuthData();
            navigate("/login", { replace: true });
            return;
        }

        setIsLoadingAvailable(true);
        setError("");

        try {
            const [availableResponse, allUnitsResponse] =
                await Promise.all([
                    fetch(
                        `${API_BASE_URL}/property-units/available`,
                        {
                            method: "GET",
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                        }
                    ),
                    fetch(
                        `${API_BASE_URL}/property-units`,
                        {
                            method: "GET",
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                        }
                    ),
                ]);

            const availableData =
                (await availableResponse.json()) as
                | AvailablePropertyResponse
                | { message?: string };

            const allUnitsData =
                (await allUnitsResponse.json()) as
                | AllPropertyUnitResponse
                | { message?: string };

            if (
                availableResponse.status === 401 ||
                allUnitsResponse.status === 401
            ) {
                clearAuthData();
                navigate("/login", { replace: true });
                return;
            }

            if (!availableResponse.ok) {
                if (availableResponse.status === 403) {
                    throw new Error(
                        "Only citizen accounts can view available properties."
                    );
                }

                throw new Error(
                    "message" in availableData &&
                    availableData.message
                        ? availableData.message
                        : "Failed to load available properties"
                );
            }

            if (!allUnitsResponse.ok) {
                throw new Error(
                    "message" in allUnitsData &&
                    allUnitsData.message
                        ? allUnitsData.message
                        : "Failed to load property units"
                );
            }

            const availableUnitData =
                availableData as AvailablePropertyResponse;
            const allUnitData =
                allUnitsData as AllPropertyUnitResponse;

            const availableUnits =
                availableUnitData.property_units ?? [];
            const allUnits =
                allUnitData.property_units ?? [];

            setAvailableProperties(availableUnits);
            setAllPropertyUnits(allUnits);
            setShowAllAvailableProperties(false);
            setSelectedAvailableBuildingId(null);

            const uniqueBuildings = Array.from(
                new Map(
                    allUnits.map((property) => [
                        property.building_id,
                        property,
                    ])
                ).values()
            );

            const stateEntries = await Promise.all(
                uniqueBuildings.map(async (property) => {
                    if (property.state?.trim()) {
                        return [
                            property.building_id,
                            property.state.trim(),
                        ] as const;
                    }

                    try {
                        const buildingResponse =
                            await fetch(
                                `${API_BASE_URL}/buildings/${encodeURIComponent(
                                    property.building_id
                                )}`,
                                {
                                    method: "GET",
                                    headers: {
                                        Authorization: `Bearer ${token}`,
                                    },
                                }
                            );

                        if (!buildingResponse.ok) {
                            return [
                                property.building_id,
                                "State Not Available",
                            ] as const;
                        }

                        const buildingData =
                            (await buildingResponse.json()) as BuildingAddressResponse;

                        const state =
                            buildingData.building?.state ??
                            buildingData.data?.building?.state ??
                            buildingData.data?.state ??
                            buildingData.state ??
                            null;

                        return [
                            property.building_id,
                            state?.trim() || "State Not Available",
                        ] as const;
                    } catch (buildingError) {
                        console.error(
                            `Building state loading error for ${property.building_id}:`,
                            buildingError
                        );

                        return [
                            property.building_id,
                            "State Not Available",
                        ] as const;
                    }
                })
            );

            setBuildingStates(
                Object.fromEntries(stateEntries)
            );
        } catch (requestError) {
            console.error(
                "Available property loading error:",
                requestError
            );

            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "Failed to load available properties"
            );
        } finally {
            setIsLoadingAvailable(false);
        }
    }, [navigate]);

    const openRegistrationForm = (
        property: AvailablePropertyUnit
    ) => {
        setSelectedAvailableProperty(property);
        setOwnerContact("");
        setOwnershipPercentage("100");
        setRegistrationError("");
    };

    const closeRegistrationForm = () => {
        if (isSubmittingRegistration) {
            return;
        }

        setSelectedAvailableProperty(null);
        setOwnerContact("");
        setOwnershipPercentage("100");
        setRegistrationError("");
    };

    const submitRegistration = async () => {
        const token = getAuthToken();
        const currentUser = getAuthUser();

        if (!token || !currentUser) {
            clearAuthData();
            navigate("/login", { replace: true });
            return;
        }

        if (!selectedAvailableProperty) {
            return;
        }

        const contact = ownerContact.trim();
        const percentage = Number(ownershipPercentage);

        if (!contact) {
            setRegistrationError(
                "Please enter your contact number."
            );
            return;
        }

        if (!/^[0-9]{10}$/.test(contact)) {
            setRegistrationError(
                "Please enter a valid 10-digit contact number."
            );
            return;
        }

        if (
            !Number.isFinite(percentage) ||
            percentage <= 0 ||
            percentage > 100
        ) {
            setRegistrationError(
                "Ownership percentage must be between 0 and 100."
            );
            return;
        }

        setIsSubmittingRegistration(true);
        setRegistrationError("");

        try {
            const response = await fetch(
                `${API_BASE_URL}/property-registrations`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        property_unit_id:
                            selectedAvailableProperty.id,
                        owner_name: currentUser.name,
                        owner_contact: contact,
                        ownership_percentage:
                            percentage,
                    }),
                }
            );

            const data =
                (await response.json()) as {
                    message?: string;
                    registration?: CitizenRegistration;
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
                    data.message ??
                    "Failed to submit property registration"
                );
            }

            closeRegistrationForm();

            await Promise.all([
                loadRegistrations(true),
                loadAvailableProperties(),
            ]);
        } catch (requestError) {
            console.error(
                "Citizen registration submission error:",
                requestError
            );

            setRegistrationError(
                requestError instanceof Error
                    ? requestError.message
                    : "Failed to submit property registration"
            );
        } finally {
            setIsSubmittingRegistration(false);
        }
    };

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
        void loadAvailableProperties();
    }, [
        loadAvailableProperties,
        loadRegistrations,
        navigate,
    ]);

    const filteredRegistrations = useMemo(() => {
        if (filter === "ALL") {
            return registrations;
        }

        return registrations.filter(
            (registration) =>
                registration.status === filter
        );
    }, [filter, registrations]);

    const availableUnitIds = useMemo(
        () =>
            new Set(
                availableProperties.map(
                    (property) => property.id
                )
            ),
        [availableProperties]
    );

    const availableBuildings = useMemo(() => {
        const grouped = new Map<
            string,
            {
                buildingId: string;
                buildingName: string;
                state: string;
                ulpin: string;
                parcelNumber: string;
                units: AvailablePropertyUnit[];
            }
        >();

        allPropertyUnits.forEach((property) => {
            const existing = grouped.get(
                property.building_id
            );

            if (existing) {
                existing.units.push(property);
                return;
            }

            grouped.set(property.building_id, {
                buildingId: property.building_id,
                buildingName: property.building_name,
                state:
                    buildingStates[property.building_id] ??
                    property.state?.trim() ??
                    "State Not Available",
                ulpin: property.parent_ulpin,
                parcelNumber: property.parcel_number,
                units: [property],
            });
        });

        return Array.from(grouped.values())
            .map((building) => ({
                ...building,
                units: [...building.units].sort(
                    (a, b) =>
                        a.floor_number - b.floor_number ||
                        a.unit_number.localeCompare(
                            b.unit_number,
                            undefined,
                            { numeric: true }
                        )
                ),
                availableCount: building.units.filter(
                    (unit) => availableUnitIds.has(unit.id)
                ).length,
            }))
            .sort(
                (a, b) =>
                    a.state.localeCompare(b.state) ||
                    a.buildingName.localeCompare(b.buildingName)
            );
    }, [
        allPropertyUnits,
        availableUnitIds,
        buildingStates,
    ]);

    const visibleAvailableBuildings = useMemo(() => {
        if (showAllAvailableProperties) {
            return availableBuildings;
        }

        return availableBuildings.slice(0, 4);
    }, [
        availableBuildings,
        showAllAvailableProperties,
    ]);

    const openPropertyHistory = async (
        registration: CitizenRegistration
    ) => {
        const token = getAuthToken();

        if (!token) {
            clearAuthData();
            navigate("/login", { replace: true });
            return;
        }

        setHistoryRegistration(registration);
        setHistoryError("");
        setPropertyHistory(null);
        setIsLoadingHistory(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/property-units/${encodeURIComponent(
                    registration.property.vertical_property_id
                )}/history`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const data =
                (await response.json()) as
                | PropertyHistoryResponse
                | { message?: string };

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
                        : "Failed to load property history"
                );
            }

            setPropertyHistory(
                data as PropertyHistoryResponse
            );
        } catch (requestError) {
            console.error(
                "Property history loading error:",
                requestError
            );

            setHistoryError(
                requestError instanceof Error
                    ? requestError.message
                    : "Failed to load property history"
            );
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const closePropertyHistory = () => {
        if (isLoadingHistory) {
            return;
        }

        setPropertyHistory(null);
        setHistoryError("");
        setHistoryRegistration(null);
    };

    const openTransferForm = (
        registration: CitizenRegistration
    ) => {
        const currentOwnership =
            currentOwnershipByPropertyUnitId[
                registration.property_unit_id
            ];

        if (
            registration.status !== "APPROVED" ||
            !registration.owner ||
            !currentOwnership ||
            currentOwnership.owner_id !==
                registration.owner.id
        ) {
            return;
        }

        setTransferRegistration(registration);
        setTransferOwnerName("");
        setTransferOwnerContact("");
        setTransferOwnershipPercentage("100");
        setTransferDate(
            new Date().toISOString().slice(0, 10)
        );
        setTransferError("");
    };

    const closeTransferForm = () => {
        if (isSubmittingTransfer) {
            return;
        }

        setTransferRegistration(null);
        setTransferOwnerName("");
        setTransferOwnerContact("");
        setTransferOwnershipPercentage("100");
        setTransferDate(
            new Date().toISOString().slice(0, 10)
        );
        setTransferError("");
    };

    const handleTransferSubmit = async () => {
        if (!transferRegistration) {
            return;
        }

        const ownerName = transferOwnerName.trim();
        const ownerContact = transferOwnerContact.trim();
        const ownershipPercentage = Number(
            transferOwnershipPercentage
        );

        if (!ownerName) {
            setTransferError("Please enter the new owner's name.");
            return;
        }

        if (
            ownerContact &&
            !/^\d{10}$/.test(ownerContact)
        ) {
            setTransferError(
                "Please enter a valid 10-digit contact number."
            );
            return;
        }

        if (
            !Number.isFinite(ownershipPercentage) ||
            ownershipPercentage <= 0 ||
            ownershipPercentage > 100
        ) {
            setTransferError(
                "Ownership percentage must be between 0.01 and 100."
            );
            return;
        }

        if (!transferDate) {
            setTransferError("Please select a transfer date.");
            return;
        }

        setTransferError("");
        setIsSubmittingTransfer(true);

        try {
            const token = getAuthToken();

            if (!token) {
    clearAuthData();
    navigate("/login", { replace: true });
    return;
}

const response = await fetch(
    `${API_BASE_URL}/property-transfer-requests`,
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            property_unit_id:
                transferRegistration.property_unit_id,
            new_owner_name: ownerName,
            new_owner_contact:
                ownerContact || null,
            ownership_percentage:
                ownershipPercentage,
            transfer_date: transferDate,
        }),
    }
);

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    clearAuthData();
                    navigate("/login", { replace: true });
                    return;
                }

                throw new Error(
                    data?.message ||
                    "Failed to submit transfer request."
                );
            }

            closeTransferForm();

            await loadRegistrations();
        } catch (err) {
            setTransferError(
                err instanceof Error
                    ? err.message
                    : "Failed to submit transfer request."
            );
        } finally {
            setIsSubmittingTransfer(false);
        }
    };

    const handleLogout = () => {
        clearAuthData();
        navigate("/login", { replace: true });
    };

    const open3DExplorer = (
        registration: CitizenRegistration
    ) => {
        /*
         * A transferred property no longer belongs to this citizen.
         * Keep a defensive guard here in addition to hiding the UI button.
         */
        if (
            registration.status !== "APPROVED" ||
            isRegistrationTransferred(registration)
        ) {
            return;
        }

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

    const getCurrentOwner = (
        registration: CitizenRegistration
    ) =>
        currentOwnershipByPropertyUnitId[
            registration.property_unit_id
        ] ?? null;

    const getDisplayOwner = (
        registration: CitizenRegistration
    ) => {
        const currentOwner = getCurrentOwner(
            registration
        );

        if (currentOwner) {
            return {
                id: currentOwner.owner_id,
                name: currentOwner.name,
                contact: currentOwner.contact,
                percentage:
                    currentOwner.ownership_percentage,
            };
        }

        return {
            id: registration.owner?.id ?? "",
            name: registration.owner?.name ?? "Not assigned",
            contact: registration.owner?.contact ?? null,
            percentage: Number(
                registration.ownership?.percentage ?? 0
            ),
        };
    };

    const isRegistrationTransferred = (
        registration: CitizenRegistration
    ) =>
        isTransferredRegistration(
            registration,
            getCurrentOwner(registration)
        );

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
                                PROPERTY REGISTRATION
                            </div>

                            <h2>
                                Available Properties
                            </h2>

                            <p>
                                Choose a building first, then select
                                an apartment for registration.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="refresh-button"
                            onClick={() =>
                                void loadAvailableProperties()
                            }
                            disabled={isLoadingAvailable}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                className={
                                    isLoadingAvailable
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
                            {isLoadingAvailable ? "Loading..." : "Refresh"}
                        </button>
                    </div>

                    {isLoadingAvailable ? (
                        <div className="property-loading">
                            <div className="loading-spinner" />
                            <span>
                                Loading buildings and apartments...
                            </span>
                        </div>
                    ) : availableBuildings.length === 0 ? (
                        <div className="empty-properties">
                            <div className="empty-icon">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
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
                            <h3>No buildings available</h3>
                            <p>
                                There are currently no generated property
                                units available in the property registry.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "18px",
                                }}
                            >
                                {visibleAvailableBuildings.map((building) => {
                                    const isExpanded =
                                        selectedAvailableBuildingId ===
                                        building.buildingId;

                                    const floorNumbers = Array.from(
                                        new Set(
                                            building.units.map(
                                                (unit) => unit.floor_number
                                            )
                                        )
                                    ).sort((a, b) => a - b);

                                    return (
                                        <article
                                            key={building.buildingId}
                                            style={{
                                                border: "1px solid rgba(92, 133, 184, 0.28)",
                                                borderRadius: "18px",
                                                background: "rgba(10, 25, 44, 0.72)",
                                                overflow: "hidden",
                                                boxShadow: "0 16px 40px rgba(0, 0, 0, 0.14)",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    padding: "22px 24px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    gap: "20px",
                                                    borderBottom: isExpanded
                                                        ? "1px solid rgba(92, 133, 184, 0.18)"
                                                        : "none",
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                <div style={{ minWidth: "260px" }}>
                                                    <div
                                                        style={{
                                                            fontSize: "14px",
                                                            fontWeight: 900,
                                                            letterSpacing: "0.16em",
                                                            textTransform: "uppercase",
                                                            color: "#69a9ff",
                                                            marginBottom: "7px",
                                                        }}
                                                    >
                                                        {building.state}
                                                    </div>

                                                    <h3
                                                        style={{
                                                            margin: 0,
                                                            fontSize: "25px",
                                                            lineHeight: 1.2,
                                                            fontWeight: 800,
                                                            color: "#f4f7fb",
                                                        }}
                                                    >
                                                        {building.buildingName}
                                                    </h3>

                                                    <div
                                                        style={{
                                                            marginTop: "9px",
                                                            display: "flex",
                                                            flexWrap: "wrap",
                                                            gap: "10px 18px",
                                                            fontSize: "12px",
                                                            color: "#8fa5c0",
                                                        }}
                                                    >
                                                        <span>
                                                            ULPIN:{" "}
                                                            <strong style={{ color: "#c8d8ec" }}>
                                                                {building.ulpin}
                                                            </strong>
                                                        </span>
                                                        <span>
                                                            Parcel:{" "}
                                                            <strong style={{ color: "#c8d8ec" }}>
                                                                {building.parcelNumber}
                                                            </strong>
                                                        </span>
                                                        <span>
                                                            {building.units.length} Apartments
                                                        </span>
                                                    </div>
                                                </div>

                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "18px",
                                                    }}
                                                >
                                                    <div style={{ textAlign: "right" }}>
                                                        <div
                                                            style={{
                                                                fontSize: "12px",
                                                                color: "#849ab4",
                                                            }}
                                                        >
                                                            Available
                                                        </div>
                                                        <div
                                                            style={{
                                                                marginTop: "4px",
                                                                fontSize: "20px",
                                                                fontWeight: 800,
                                                                color: "#eaf2ff",
                                                            }}
                                                        >
                                                            {building.availableCount}{" "}
                                                            <span
                                                                style={{
                                                                    fontSize: "13px",
                                                                    fontWeight: 500,
                                                                    color: "#849ab4",
                                                                }}
                                                            >
                                                                of {building.units.length}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="primary-action"
                                                        onClick={() =>
                                                            setSelectedAvailableBuildingId(
                                                                isExpanded
                                                                    ? null
                                                                    : building.buildingId
                                                            )
                                                        }
                                                    >
                                                        {isExpanded
                                                            ? "Hide Apartments"
                                                            : "View Apartments"}
                                                    </button>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div
                                                    style={{
                                                        padding: "22px 24px 26px",
                                                        background: "rgba(6, 18, 34, 0.48)",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "center",
                                                            gap: "12px",
                                                            marginBottom: "18px",
                                                            flexWrap: "wrap",
                                                        }}
                                                    >
                                                        <div>
                                                            <div
                                                                style={{
                                                                    fontSize: "12px",
                                                                    fontWeight: 800,
                                                                    letterSpacing: "0.12em",
                                                                    textTransform: "uppercase",
                                                                    color: "#7198c7",
                                                                }}
                                                            >
                                                                SELECT APARTMENT
                                                            </div>
                                                            <div
                                                                style={{
                                                                    marginTop: "5px",
                                                                    fontSize: "13px",
                                                                    color: "#879bb5",
                                                                }}
                                                            >
                                                                Bright apartments are available. Dim apartments are already registered.
                                                            </div>
                                                        </div>

                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                gap: "8px",
                                                                alignItems: "center",
                                                                fontSize: "11px",
                                                                color: "#91a5be",
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    width: "9px",
                                                                    height: "9px",
                                                                    borderRadius: "50%",
                                                                    background: "#4da3ff",
                                                                    display: "inline-block",
                                                                }}
                                                            />
                                                            Available
                                                            <span
                                                                style={{
                                                                    marginLeft: "8px",
                                                                    width: "9px",
                                                                    height: "9px",
                                                                    borderRadius: "50%",
                                                                    background: "#33445a",
                                                                    display: "inline-block",
                                                                }}
                                                            />
                                                            Registered
                                                        </div>
                                                    </div>

                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            gap: "18px",
                                                        }}
                                                    >
                                                        {floorNumbers.map((floorNumber) => {
                                                            const floorUnits = building.units.filter(
                                                                (unit) => unit.floor_number === floorNumber
                                                            );
                                                            const floorLabel =
                                                                floorUnits[0]?.floor_label ??
                                                                `Floor ${floorNumber}`;

                                                            return (
                                                                <div
                                                                    key={`${building.buildingId}-${floorNumber}`}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            fontSize: "14px",
                                                                            fontWeight: 800,
                                                                            color: "#d8e6f7",
                                                                            marginBottom: "10px",
                                                                        }}
                                                                    >
                                                                        {floorLabel}
                                                                    </div>

                                                                    <div
                                                                        style={{
                                                                            display: "grid",
                                                                            gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))",
                                                                            gap: "10px",
                                                                        }}
                                                                    >
                                                                        {floorUnits.map((property) => {
                                                                            const isAvailable =
                                                                                availableUnitIds.has(property.id);

                                                                            return (
                                                                                <button
                                                                                    key={property.id}
                                                                                    type="button"
                                                                                    disabled={!isAvailable}
                                                                                    onClick={() => {
                                                                                        if (isAvailable) {
                                                                                            openRegistrationForm(property);
                                                                                        }
                                                                                    }}
                                                                                    title={
                                                                                        isAvailable
                                                                                            ? `Register Unit ${property.unit_number}`
                                                                                            : `Unit ${property.unit_number} is already registered`
                                                                                    }
                                                                                    style={{
                                                                                        minHeight: "74px",
                                                                                        padding: "10px 8px",
                                                                                        borderRadius: "12px",
                                                                                        border: isAvailable
                                                                                            ? "1px solid rgba(77, 163, 255, 0.55)"
                                                                                            : "1px solid rgba(75, 94, 119, 0.25)",
                                                                                        background: isAvailable
                                                                                            ? "rgba(35, 91, 151, 0.38)"
                                                                                            : "rgba(28, 41, 58, 0.48)",
                                                                                        color: isAvailable
                                                                                            ? "#eef6ff"
                                                                                            : "#66778e",
                                                                                        cursor: isAvailable
                                                                                            ? "pointer"
                                                                                            : "not-allowed",
                                                                                        opacity: isAvailable ? 1 : 0.58,
                                                                                        display: "flex",
                                                                                        flexDirection: "column",
                                                                                        alignItems: "center",
                                                                                        justifyContent: "center",
                                                                                        gap: "5px",
                                                                                        transition: "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease",
                                                                                    }}
                                                                                >
                                                                                    <strong style={{ fontSize: "17px" }}>
                                                                                        {property.unit_number}
                                                                                    </strong>
                                                                                    <span
                                                                                        style={{
                                                                                            fontSize: "10px",
                                                                                            letterSpacing: "0.05em",
                                                                                            textTransform: "uppercase",
                                                                                        }}
                                                                                    >
                                                                                        {isAvailable
                                                                                            ? "Available"
                                                                                            : "Registered"}
                                                                                    </span>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>

                            {availableBuildings.length > 4 && (
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "center",
                                        marginTop: "18px",
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="refresh-button"
                                        onClick={() =>
                                            setShowAllAvailableProperties(
                                                (current) => !current
                                            )
                                        }
                                    >
                                        {showAllAvailableProperties
                                            ? "Show Less"
                                            : `Show All ${availableBuildings.length} Buildings`}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
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

                                                {isRegistrationTransferred(
                                                    registration
                                                )
                                                    ? `Transferred to ${getDisplayOwner(
                                                        registration
                                                    ).name}`
                                                    : statusLabel(
                                                        registration.status
                                                    )}
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
                                                        getDisplayOwner(
                                                            registration
                                                        ).percentage
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
                                                    {isRegistrationTransferred(
                                                        registration
                                                    )
                                                        ? "Current Owner"
                                                        : "Registered Owner"}
                                                </span>

                                                <strong>
                                                    {getDisplayOwner(
                                                        registration
                                                    ).name}
                                                </strong>
                                            </div>

                                            <div className="owner-percentage">
                                                {formatPercentage(
                                                    getDisplayOwner(
                                                        registration
                                                    ).percentage
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
                                                    className="secondary-action"
                                                    onClick={() =>
                                                        void openPropertyHistory(
                                                            registration
                                                        )
                                                    }
                                                >
                                                    History
                                                </button>

                                                {registration.status === "APPROVED" &&
                                                    !isRegistrationTransferred(
                                                        registration
                                                    ) &&
                                                    currentOwnershipByPropertyUnitId[
                                                        registration.property_unit_id
                                                    ] && (
                                                        <button
                                                            type="button"
                                                            className="secondary-action"
                                                            onClick={() =>
                                                                openTransferForm(
                                                                    registration
                                                                )
                                                            }
                                                        >
                                                            Transfer Property
                                                        </button>
                                                    )}

                                                {registration.status === "APPROVED" &&
                                                    !isRegistrationTransferred(
                                                        registration
                                                    ) &&
                                                    currentOwnershipByPropertyUnitId[
                                                        registration.property_unit_id
                                                    ] && (
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
                                                )}
                                            </div>
                                        </div>
                                    </article>
                                )
                            )}
                        </div>
                    )}
                </section>
            </main>

            {selectedAvailableProperty && (
                <div
                    className="citizen-modal-backdrop"
                    onMouseDown={(event) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            closeRegistrationForm();
                        }
                    }}
                >
                    <div className="citizen-modal">
                        <div className="citizen-modal-header">
                            <div>
                                <div className="section-kicker">
                                    PROPERTY REGISTRATION
                                </div>

                                <h2>
                                    Register Property
                                </h2>

                                <p>
                                    {
                                        selectedAvailableProperty
                                            .building_name
                                    }{" "}
                                    ·{" "}
                                    {
                                        selectedAvailableProperty
                                            .floor_label
                                    }{" "}
                                    · Unit{" "}
                                    {
                                        selectedAvailableProperty
                                            .unit_number
                                    }
                                </p>
                            </div>

                            <button
                                type="button"
                                className="modal-close"
                                onClick={closeRegistrationForm}
                                disabled={
                                    isSubmittingRegistration
                                }
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <div className="modal-status-row">
                            <div className="property-status status-neutral">
                                <span className="status-dot" />
                                Available for Registration
                            </div>
                        </div>

                        <div className="modal-vpid">
                            <span>
                                Vertical Property ID
                            </span>

                            <strong>
                                {
                                    selectedAvailableProperty
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
                                        selectedAvailableProperty
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
                                        selectedAvailableProperty.id
                                    }
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Floor
                                </span>

                                <strong>
                                    {
                                        selectedAvailableProperty
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
                                        selectedAvailableProperty
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
                                        selectedAvailableProperty
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
                                        selectedAvailableProperty
                                            .min_z
                                    }{" "}
                                    →{" "}
                                    {
                                        selectedAvailableProperty
                                            .max_z
                                    }{" "}
                                    m
                                </strong>
                            </div>
                        </div>

                        <div className="modal-section">
                            <h3>
                                Applicant Details
                            </h3>

                            <div className="modal-grid">
                                <div className="modal-field">
                                    <label htmlFor="citizen-owner-name">
                                        Owner Name
                                    </label>

                                    <input
                                        id="citizen-owner-name"
                                        type="text"
                                        value={
                                            user?.name ?? ""
                                        }
                                        readOnly
                                    />
                                </div>

                                <div className="modal-field">
                                    <label htmlFor="citizen-owner-contact">
                                        Contact Number
                                    </label>

                                    <input
                                        id="citizen-owner-contact"
                                        type="tel"
                                        inputMode="numeric"
                                        maxLength={10}
                                        value={ownerContact}
                                        onChange={(event) =>
                                            setOwnerContact(
                                                event.target.value.replace(
                                                    /\D/g,
                                                    ""
                                                )
                                            )
                                        }
                                        placeholder="10-digit mobile number"
                                        disabled={
                                            isSubmittingRegistration
                                        }
                                    />
                                </div>

                                <div className="modal-field">
                                    <label htmlFor="citizen-ownership-percentage">
                                        Ownership Percentage
                                    </label>

                                    <input
                                        id="citizen-ownership-percentage"
                                        type="number"
                                        min="0.01"
                                        max="100"
                                        step="0.01"
                                        value={
                                            ownershipPercentage
                                        }
                                        onChange={(event) =>
                                            setOwnershipPercentage(
                                                event.target.value
                                            )
                                        }
                                        disabled={
                                            isSubmittingRegistration
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="remarks-box">
                            <span>
                                Registration Process
                            </span>

                            <p>
                                Your request will be submitted
                                to a government officer for
                                verification. Once approved, the
                                property will receive an official
                                registration number.
                            </p>
                        </div>

                        {registrationError && (
                            <div className="citizen-error">
                                <strong>
                                    Registration failed
                                </strong>

                                <span>
                                    {registrationError}
                                </span>
                            </div>
                        )}

                        <div className="citizen-modal-footer">
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={closeRegistrationForm}
                                disabled={
                                    isSubmittingRegistration
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="primary-action"
                                onClick={() =>
                                    void submitRegistration()
                                }
                                disabled={
                                    isSubmittingRegistration
                                }
                            >
                                {isSubmittingRegistration
                                    ? "Submitting..."
                                    : "Submit Registration"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

                                {isRegistrationTransferred(
                                    selectedRegistration
                                )
                                    ? `Transferred to ${getDisplayOwner(
                                        selectedRegistration
                                    ).name}`
                                    : statusLabel(
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

                            {(() => {
                                const liveOwner =
                                    getDisplayOwner(
                                        selectedRegistration
                                    );

                                const transferred =
                                    isRegistrationTransferred(
                                        selectedRegistration
                                    );

                                return (
                                    <>
                                        <div className="ownership-panel">
                                            <div className="owner-avatar large">
                                                {liveOwner.name
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </div>

                                            <div className="ownership-person">
                                                <span>
                                                    {transferred
                                                        ? "Transferred To"
                                                        : "Owner"}
                                                </span>

                                                <strong>
                                                    {liveOwner.name}
                                                </strong>

                                                <small>
                                                    {liveOwner.contact ??
                                                        "Contact not available"}
                                                </small>
                                            </div>

                                            <div className="ownership-value">
                                                <span>
                                                    Ownership
                                                </span>

                                                <strong>
                                                    {formatPercentage(
                                                        liveOwner.percentage
                                                    )}
                                                </strong>
                                            </div>
                                        </div>

                                        {transferred && (
                                            <div className="remarks-box">
                                                <span>
                                                    Ownership Status
                                                </span>

                                                <p>
                                                    This property has been transferred to {liveOwner.name}.
                                                    The previous ownership record is preserved in Property History.
                                                </p>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
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

                            {selectedRegistration.status === "APPROVED" &&
                                !isRegistrationTransferred(
                                    selectedRegistration
                                ) &&
                                currentOwnershipByPropertyUnitId[
                                    selectedRegistration.property_unit_id
                                ] && (
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
                            )}
                        </div>
                    </div>
                </div>
            )}

            {transferRegistration && (
                <div
                    className="citizen-modal-backdrop"
                    onMouseDown={(event) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            closeTransferForm();
                        }
                    }}
                >
                    <div className="citizen-modal">
                        <div className="citizen-modal-header">
                            <div>
                                <div className="section-kicker">
                                    OWNERSHIP TRANSFER
                                </div>

                                <h2>
                                    Transfer Property
                                </h2>

                                <p>
                                    {
                                        transferRegistration
                                            .property
                                            .building_name
                                    }{" "}
                                    ·{" "}
                                    {
                                        transferRegistration
                                            .property
                                            .floor_label
                                    }{" "}
                                    · Unit{" "}
                                    {
                                        transferRegistration
                                            .property
                                            .unit_number
                                    }
                                </p>
                            </div>

                            <button
                                type="button"
                                className="modal-close"
                                onClick={closeTransferForm}
                                disabled={
                                    isSubmittingTransfer
                                }
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <div className="modal-status-row">
                            <div className="property-status status-approved">
                                <span className="status-dot" />
                                Registered Property
                            </div>
                        </div>

                        <div className="modal-vpid">
                            <span>
                                Vertical Property ID
                            </span>

                            <strong>
                                {
                                    transferRegistration
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
                                        transferRegistration
                                            .property
                                            .parent_ulpin
                                    }
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Unit
                                </span>

                                <strong>
                                    {
                                        transferRegistration
                                            .property
                                            .unit_number
                                    }
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Floor
                                </span>

                                <strong>
                                    {
                                        transferRegistration
                                            .property
                                            .floor_label
                                    }
                                </strong>
                            </div>

                            <div className="modal-field">
                                <span>
                                    Current Owner
                                </span>

                                <strong>
                                    {getDisplayOwner(
                                        transferRegistration
                                    ).name}
                                </strong>
                            </div>
                        </div>

                        <div className="modal-section">
                            <h3>
                                New Owner Details
                            </h3>

                            <div className="modal-grid">
                                <div className="modal-field">
                                    <label htmlFor="transfer-owner-name">
                                        New Owner Name
                                    </label>

                                    <input
                                        id="transfer-owner-name"
                                        type="text"
                                        value={
                                            transferOwnerName
                                        }
                                        onChange={(event) =>
                                            setTransferOwnerName(
                                                event.target.value
                                            )
                                        }
                                        placeholder="Enter new owner name"
                                        disabled={
                                            isSubmittingTransfer
                                        }
                                    />
                                </div>

                                <div className="modal-field">
                                    <label htmlFor="transfer-owner-contact">
                                        New Owner Contact
                                    </label>

                                    <input
                                        id="transfer-owner-contact"
                                        type="tel"
                                        inputMode="numeric"
                                        maxLength={10}
                                        value={
                                            transferOwnerContact
                                        }
                                        onChange={(event) =>
                                            setTransferOwnerContact(
                                                event.target.value.replace(
                                                    /\D/g,
                                                    ""
                                                )
                                            )
                                        }
                                        placeholder="10-digit mobile number"
                                        disabled={
                                            isSubmittingTransfer
                                        }
                                    />
                                </div>

                                <div className="modal-field">
                                    <label htmlFor="transfer-ownership-percentage">
                                        Ownership Percentage
                                    </label>

                                    <input
                                        id="transfer-ownership-percentage"
                                        type="number"
                                        min="0.01"
                                        max="100"
                                        step="0.01"
                                        value={
                                            transferOwnershipPercentage
                                        }
                                        onChange={(event) =>
                                            setTransferOwnershipPercentage(
                                                event.target.value
                                            )
                                        }
                                        disabled={
                                            isSubmittingTransfer
                                        }
                                    />
                                </div>

                                <div className="modal-field">
                                    <label htmlFor="transfer-date">
                                        Transfer Date
                                    </label>

                                    <input
                                        id="transfer-date"
                                        type="date"
                                        value={
                                            transferDate
                                        }
                                        onChange={(event) =>
                                            setTransferDate(
                                                event.target.value
                                            )
                                        }
                                        disabled={
                                            isSubmittingTransfer
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="remarks-box">
                            <span>
                                Government Verification
                            </span>

                            <p>
                                This transfer will first be submitted
                                as a pending request. A government
                                officer must verify and approve the
                                request before ownership is changed.
                            </p>
                        </div>

                        {transferError && (
                            <div className="citizen-error">
                                <strong>
                                    Transfer request failed
                                </strong>

                                <span>
                                    {transferError}
                                </span>
                            </div>
                        )}

                        <div className="citizen-modal-footer">
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={closeTransferForm}
                                disabled={
                                    isSubmittingTransfer
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="primary-action"
                                onClick={() => void handleTransferSubmit()}
                                disabled={isSubmittingTransfer}
                            >
                                {isSubmittingTransfer
                                    ? "Submitting..."
                                    : "Submit Transfer Request"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(isLoadingHistory || historyError || propertyHistory) && (
                <div
                    className="citizen-modal-backdrop"
                    onMouseDown={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            !isLoadingHistory
                        ) {
                            closePropertyHistory();
                        }
                    }}
                >
                    <div className="citizen-modal history-modal">
                        <div className="citizen-modal-header">
                            <div>
                                <div className="section-kicker">
                                    PROPERTY HISTORY
                                </div>

                                <h2>
                                    {propertyHistory
                                        ? propertyHistory.property.building.name
                                        : "Property History"}
                                </h2>

                                {propertyHistory && (
                                    <p>
                                        {propertyHistory.property.floor_label} · Unit{" "}
                                        {propertyHistory.property.unit_number}
                                    </p>
                                )}
                            </div>

                            {!isLoadingHistory && (
                                <button
                                    type="button"
                                    className="modal-close"
                                    onClick={closePropertyHistory}
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        {isLoadingHistory ? (
                            <div className="property-loading">
                                <div className="loading-spinner" />
                                <span>
                                    Loading ownership history...
                                </span>
                            </div>
                        ) : historyError ? (
                            <div className="citizen-error">
                                <strong>
                                    Unable to load history
                                </strong>

                                <span>
                                    {historyError}
                                </span>

                                {historyRegistration && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void openPropertyHistory(
                                                historyRegistration
                                            )
                                        }
                                    >
                                        Try Again
                                    </button>
                                )}
                            </div>
                        ) : propertyHistory ? (
                            <>
                                <div className="modal-vpid">
                                    <span>
                                        Vertical Property ID
                                    </span>

                                    <strong>
                                        {
                                            propertyHistory.property
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
                                                propertyHistory.property
                                                    .parent_ulpin
                                            }
                                        </strong>
                                    </div>

                                    <div className="modal-field">
                                        <span>
                                            Building
                                        </span>

                                        <strong>
                                            {
                                                propertyHistory.property
                                                    .building.name
                                            }
                                        </strong>
                                    </div>

                                    <div className="modal-field">
                                        <span>
                                            Floor
                                        </span>

                                        <strong>
                                            {
                                                propertyHistory.property
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
                                                propertyHistory.property
                                                    .unit_number
                                            }
                                        </strong>
                                    </div>
                                </div>

                                {/* Current Owner */}
                                <div className="modal-section">
                                    <h3>
                                        Current Owner
                                    </h3>

                                    {propertyHistory.current_owner ? (
                                        <div className="ownership-panel">
                                            <div className="owner-avatar large">
                                                {propertyHistory.current_owner.name
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </div>

                                            <div className="ownership-person">
                                                <span>
                                                    Owner
                                                </span>

                                                <strong>
                                                    {
                                                        propertyHistory
                                                            .current_owner
                                                            .name
                                                    }
                                                </strong>

                                                <small>
                                                    {
                                                        propertyHistory
                                                            .current_owner
                                                            .contact
                                                    }
                                                </small>
                                            </div>

                                            <div className="ownership-value">
                                                <span>
                                                    Ownership
                                                </span>

                                                <strong>
                                                    {formatPercentage(
                                                        propertyHistory
                                                            .current_owner
                                                            .ownership_percentage
                                                    )}
                                                </strong>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="remarks-box">
                                            <span>
                                                No Active Owner
                                            </span>

                                            <p>
                                                This property currently has no active
                                                ownership record.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Ownership History */}
                                <div className="modal-section">
                                    <h3>
                                        Ownership History
                                    </h3>

                                    {propertyHistory.ownership_history
                                        .length === 0 ? (
                                        <div className="remarks-box">
                                            <p>
                                                No ownership history available.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="history-list">
                                            {propertyHistory.ownership_history.map(
                                                (ownership) => (
                                                    <div
                                                        key={ownership.id}
                                                        className={
                                                            ownership.is_current
                                                                ? "history-card current"
                                                                : "history-card"
                                                        }
                                                    >
                                                        <div className="history-card-header">
                                                            <div>
                                                                <strong>
                                                                    {
                                                                        ownership.name
                                                                    }
                                                                </strong>

                                                                <span>
                                                                    {ownership.is_current
                                                                        ? "Current Owner"
                                                                        : "Previous Owner"}
                                                                </span>
                                                            </div>

                                                            <strong>
                                                                {formatPercentage(
                                                                    ownership.ownership_percentage
                                                                )}
                                                            </strong>
                                                        </div>

                                                        <div className="history-card-details">
                                                            <span>
                                                                Valid From
                                                            </span>

                                                            <strong>
                                                                {formatDate(
                                                                    ownership.valid_from
                                                                )}
                                                            </strong>

                                                            <span>
                                                                Valid To
                                                            </span>

                                                            <strong>
                                                                {ownership.valid_to
                                                                    ? formatDate(
                                                                        ownership.valid_to
                                                                    )
                                                                    : "Present"}
                                                            </strong>
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Audit Trail */}
                                <div className="modal-section">
                                    <h3>
                                        Audit Trail
                                    </h3>

                                    {propertyHistory.audit_trail
                                        .length === 0 ? (
                                        <div className="remarks-box">
                                            <p>
                                                No audit events available for this
                                                property.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="audit-timeline">
                                            {propertyHistory.audit_trail.map(
                                                (audit) => (
                                                    <div
                                                        key={audit.id}
                                                        className="audit-item"
                                                    >
                                                        <div className="audit-marker">
                                                            <span />
                                                        </div>

                                                        <div className="audit-content">
                                                            <div className="audit-header">
                                                                <strong>
                                                                    {auditActionLabel(
                                                                    audit.action
                                                                )}
                                                                </strong>

                                                                <span>
                                                                    {formatDateTime(
                                                                        audit.created_at
                                                                    )}
                                                                </span>
                                                            </div>

                                                            <div className="audit-status-row">
                                                                {audit.previous_status && (
                                                                    <span>
                                                                        {
                                                                            audit.previous_status
                                                                        }
                                                                    </span>
                                                                )}

                                                                {audit.previous_status &&
                                                                    audit.new_status && (
                                                                        <span>
                                                                            →
                                                                        </span>
                                                                    )}

                                                                {audit.new_status && (
                                                                    <span>
                                                                        {
                                                                            audit.new_status
                                                                        }
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {audit.actor && (
                                                                <div className="audit-actor">
                                                                    <span>
                                                                        Performed by
                                                                    </span>

                                                                    <strong>
                                                                        {
                                                                            audit.actor
                                                                                .name
                                                                        }
                                                                    </strong>

                                                                    <small>
                                                                        {
                                                                            audit.actor
                                                                                .role
                                                                        }
                                                                    </small>
                                                                </div>
                                                            )}

                                                            {audit.remarks && (
                                                                <p className="audit-remarks">
                                                                    {
                                                                        audit.remarks
                                                                    }
                                                                </p>
                                                            )}

                                                            {typeof audit.metadata
                                                                .registration_number ===
                                                                "string" && (
                                                                    <div className="audit-registration">
                                                                        Registration:
                                                                        <strong>
                                                                            {
                                                                                audit
                                                                                    .metadata
                                                                                    .registration_number
                                                                            }
                                                                        </strong>
                                                                    </div>
                                                                )}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="citizen-modal-footer">
                                    <button
                                        type="button"
                                        className="secondary-action"
                                        onClick={closePropertyHistory}
                                    >
                                        Close
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            )}

        </div>
    );
}

export default CitizenDashboard;