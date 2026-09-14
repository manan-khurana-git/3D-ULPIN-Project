import {
    useEffect,
    useMemo,
    useState,
} from "react";
import { useNavigate } from "react-router-dom";

import GenerateBuildingModal from "../components/GenerateBuildingModal";

import {
    clearAuthData,
    getAuthToken,
    getAuthUser,
    type AuthUser,
} from "../services/authService.ts";

import "./SurveyorDashboard.css";

const API_URL = "http://localhost:5000/api";

const formatStructureType = (value: string) => {
    return value
        .toLowerCase()
        .split("_")
        .map((part) =>
            part.charAt(0).toUpperCase() + part.slice(1)
        )
        .join(" ");
};

/* =========================================================
   TYPES
========================================================= */

type Parcel = {
    id: string;
    ulpin: string;
    parcel_number: string | null;
    area_sq_m: string | number | null;
    base_elevation_m: string | number | null;
    geometry: {
        type: "Polygon";
        coordinates: number[][][];
    } | null;
    created_at: string;
};

type Building = {
    id: string;
    parcel_id: string;
    building_name: string;

    country?: string | null;
    state?: string | null;
    district?: string | null;
    city?: string | null;
    area?: string | null;
    street?: string | null;
    pincode?: string | null;
    address_line?: string | null;

    floor_height_m: string | number;
    base_elevation_m: string | number;
    floors: number;

    ulpin: string;
    parcel_number: string | null;

    created_at?: string;
};

type PropertyUnit = {
    id: string;
    building_id?: string;
    floor_id?: string;

    unit_number: string;
    vertical_property_id: string;

    floor_number: number;
    floor_label: string;

    area_sq_m: string | number;
    min_z: string | number;
    max_z: string | number;
};

type StructureWashroom = {
    id: string;
    washroom_name: string;
    washroom_type: string;
    area_sq_m: string | number | null;
};

type StructureRoom = {
    id: string;
    room_name: string;
    room_type: string;
    area_sq_m: string | number | null;
    floor_number: number | null;
    washrooms: StructureWashroom[];
};

type StructureApartment = {
    id: string;
    unit_number: string;
    vertical_property_id: string;
    parent_ulpin: string;
    area_sq_m: string | number | null;
    min_z: string | number;
    max_z: string | number;
    rooms: StructureRoom[];
};

type StructureCorridor = {
    id: string;
    corridor_name: string;
    corridor_type: string;
    width_m: string | number | null;
    length_m: string | number | null;
};

type StructureFloor = {
    id: string;
    floor_number: number;
    floor_label: string;
    min_z: string | number;
    max_z: string | number;
    corridors: StructureCorridor[];
    apartments: StructureApartment[];
};

type StructureParking = {
    id: string;
    parking_number: string;
    parking_type: string;
    parking_location: string | null;
    area_sq_m: string | number | null;
    is_covered: boolean;
    assigned_apartment: {
        property_unit_id: string;
        unit_number: string;
        vertical_property_id: string;
    } | null;
};

type BuildingStructure = {
    status: string;
    building: {
        id: string;
        building_name: string;
        number_of_floors: number;
        floor_height_m: string | number;
        base_elevation_m: string | number;
        address: {
            country: string | null;
            state: string | null;
            district: string | null;
            city: string | null;
            area: string | null;
            street: string | null;
            pincode: string | null;
            address_line: string | null;
        };
        parcel: {
            id: string;
            ulpin: string;
            parcel_number: string | null;
        } | null;
    };
    floors: StructureFloor[];
    parking: StructureParking[];
};

type StructureAction =
    | "CORRIDOR"
    | "ROOM"
    | "WASHROOM"
    | "PARKING";

type StructureFormState = {
    name: string;
    type: string;
    area: string;
    width: string;
    length: string;
    location: string;
    covered: boolean;
};

/* =========================================================
   COMPONENT
========================================================= */

function SurveyorDashboard() {
    const navigate = useNavigate();

    const [authUser, setAuthUser] =
        useState<AuthUser | null>(
            getAuthUser()
        );

    const [buildings, setBuildings] =
        useState<Building[]>([]);

    const [parcels, setParcels] =
        useState<Parcel[]>([]);

    const [propertyUnits, setPropertyUnits] =
        useState<PropertyUnit[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState("");

    const [
        generateBuildingOpen,
        setGenerateBuildingOpen,
    ] = useState(false);

    const [
        selectedParcel,
        setSelectedParcel,
    ] = useState<Parcel | null>(null);

    const [
        selectedBuildingId,
        setSelectedBuildingId,
    ] = useState<string | null>(null);

    const [
        buildingStructure,
        setBuildingStructure,
    ] = useState<BuildingStructure | null>(null);

    const [
        structureLoading,
        setStructureLoading,
    ] = useState(false);

    const [
        structureError,
        setStructureError,
    ] = useState("");

    /* =======================================================
       SEARCH
    ======================================================= */

    const [searchQuery, setSearchQuery] =
        useState("");

    const [
        submittedSearch,
        setSubmittedSearch,
    ] = useState("");

    /* =======================================================
       STRUCTURE MANAGER
    ======================================================= */

    const [structureAction, setStructureAction] =
        useState<StructureAction | null>(null);

    const [structureTargetFloorId, setStructureTargetFloorId] =
        useState<string | null>(null);

    const [structureTargetUnitId, setStructureTargetUnitId] =
        useState<string | null>(null);

    const [structureTargetRoomId, setStructureTargetRoomId] =
        useState<string | null>(null);

    const [structureForm, setStructureForm] =
        useState<StructureFormState>({
            name: "",
            type: "",
            area: "",
            width: "",
            length: "",
            location: "",
            covered: false,
        });

    const [structureSaving, setStructureSaving] =
        useState(false);

    const [structureActionError, setStructureActionError] =
        useState("");

    /* =======================================================
       AUTHORIZATION
    ======================================================= */

    useEffect(() => {
        const user = getAuthUser();

        if (!user) {
            navigate("/login", {
                replace: true,
            });

            return;
        }

        if (
            user.role !== "SURVEYOR" &&
            user.role !== "ADMIN"
        ) {
            navigate("/dashboard", {
                replace: true,
            });

            return;
        }

        setAuthUser(user);
    }, [navigate]);

    /* =======================================================
       API FETCH
    ======================================================= */

    const apiFetch = async (
        url: string,
        options: RequestInit = {}
    ): Promise<Response> => {
        const token = getAuthToken();

        const headers = new Headers(
            options.headers
        );

        if (token) {
            headers.set(
                "Authorization",
                `Bearer ${token}`
            );
        }

        return fetch(url, {
            ...options,
            headers,
        });
    };

    const loadBuildingStructure = async (
        buildingId: string
    ) => {
        try {
            setStructureLoading(true);
            setStructureError("");

            const response = await apiFetch(
                `${API_URL}/building-structure/${buildingId}`
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Building structure could not be loaded."
                );
            }

            setBuildingStructure(data);
        } catch (structureLoadError) {
            console.error(
                "Building structure loading error:",
                structureLoadError
            );

            setBuildingStructure(null);

            setStructureError(
                structureLoadError instanceof Error
                    ? structureLoadError.message
                    : "Building structure could not be loaded."
            );
        } finally {
            setStructureLoading(false);
        }
    };

    /* =======================================================
       LOAD DASHBOARD
    ======================================================= */

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            setError("");

            const [
                buildingsResponse,
                parcelsResponse,
                unitsResponse,
            ] = await Promise.all([
                apiFetch(
                    `${API_URL}/buildings`
                ),
                apiFetch(
                    `${API_URL}/parcels`
                ),
                apiFetch(
                    `${API_URL}/property-units`
                ),
            ]);

            if (!buildingsResponse.ok) {
                throw new Error(
                    `Building API returned ${buildingsResponse.status}`
                );
            }

            if (!parcelsResponse.ok) {
                throw new Error(
                    `Parcel API returned ${parcelsResponse.status}`
                );
            }

            if (!unitsResponse.ok) {
                throw new Error(
                    `Property Unit API returned ${unitsResponse.status}`
                );
            }

            const buildingsData =
                await buildingsResponse.json();

            const parcelsData =
                await parcelsResponse.json();

            const unitsData =
                await unitsResponse.json();

            if (
                !Array.isArray(
                    buildingsData.buildings
                )
            ) {
                throw new Error(
                    "Invalid building response"
                );
            }

            if (
                !Array.isArray(
                    parcelsData.parcels
                )
            ) {
                throw new Error(
                    "Invalid parcel response"
                );
            }

            let units: PropertyUnit[] = [];

            if (
                Array.isArray(
                    unitsData.property_units
                )
            ) {
                units =
                    unitsData.property_units;
            } else if (
                Array.isArray(
                    unitsData.units
                )
            ) {
                units =
                    unitsData.units;
            }

            setBuildings(
                buildingsData.buildings
            );

            setParcels(
                parcelsData.parcels
            );

            setPropertyUnits(
                units
            );
        } catch (loadError) {
            console.error(
                "Surveyor dashboard loading error:",
                loadError
            );

            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Dashboard data could not be loaded."
            );
        } finally {
            setLoading(false);
        }
    };

    /* =======================================================
       INITIAL LOAD
    ======================================================= */

    useEffect(() => {
        if (
            authUser &&
            (
                authUser.role === "SURVEYOR" ||
                authUser.role === "ADMIN"
            )
        ) {
            void loadDashboardData();
        }
    }, [authUser]);

    /* =======================================================
       STATISTICS
    ======================================================= */

    const totalBuildings =
        buildings.length;

    const totalFloors =
        buildings.reduce(
            (
                total,
                currentBuilding
            ) =>
                total +
                Number(
                    currentBuilding.floors || 0
                ),
            0
        );

    const totalApartments =
        propertyUnits.length;

    const mappedParcels =
        parcels.filter(
            (parcel) =>
                parcel.geometry !== null
        ).length;

    /* =======================================================
       APARTMENT COUNT BY BUILDING
    ======================================================= */

    const apartmentCountByBuilding =
        useMemo(() => {
            const counts =
                new Map<string, number>();

            propertyUnits.forEach(
                (unit) => {
                    if (!unit.building_id) {
                        return;
                    }

                    counts.set(
                        unit.building_id,
                        (
                            counts.get(
                                unit.building_id
                            ) ?? 0
                        ) + 1
                    );
                }
            );

            return counts;
        }, [propertyUnits]);

    /* =======================================================
       SORT BUILDINGS BY STATE
    ======================================================= */

    const sortedBuildings =
        useMemo(() => {
            return buildings
                .slice()
                .sort(
                    (
                        first,
                        second
                    ) => {
                        const firstState =
                            first.state?.trim() ||
                            "State Not Available";

                        const secondState =
                            second.state?.trim() ||
                            "State Not Available";

                        const stateResult =
                            firstState.localeCompare(
                                secondState
                            );

                        if (
                            stateResult !== 0
                        ) {
                            return stateResult;
                        }

                        return first.building_name.localeCompare(
                            second.building_name
                        );
                    }
                );
        }, [buildings]);

    /* =======================================================
       SEARCH
    ======================================================= */

    const searchedBuildings =
        useMemo(() => {
            const query =
                submittedSearch
                    .trim()
                    .toLowerCase();

            if (!query) {
                return sortedBuildings;
            }

            return sortedBuildings.filter(
                (building) => {
                    const buildingName =
                        building.building_name
                            ?.toLowerCase() ?? "";

                    const ulpin =
                        building.ulpin
                            ?.toLowerCase() ?? "";

                    const buildingUnits =
                        propertyUnits.filter(
                            (unit) =>
                                unit.building_id ===
                                building.id
                        );

                    const hasMatchingVpin =
                        buildingUnits.some(
                            (unit) =>
                                unit.vertical_property_id
                                    ?.toLowerCase()
                                    .includes(query)
                        );

                    return (
                        buildingName.includes(query) ||
                        ulpin.includes(query) ||
                        hasMatchingVpin
                    );
                }
            );
        }, [
            sortedBuildings,
            submittedSearch,
            propertyUnits,
        ]);

    const handleSearch = () => {
        setSubmittedSearch(
            searchQuery.trim()
        );

        if (!searchQuery.trim()) {
            setSelectedBuildingId(null);
        }
    };

    const clearSearch = () => {
        setSearchQuery("");
        setSubmittedSearch("");
        setSelectedBuildingId(null);
    };

    /* =======================================================
       GENERATE BUILDING
    ======================================================= */

    const openGenerateBuilding =
        () => {
            if (
                authUser?.role !==
                "SURVEYOR" &&
                authUser?.role !==
                "ADMIN"
            ) {
                window.alert(
                    "You do not have permission to generate a building."
                );

                return;
            }

            setSelectedParcel(null);

            setGenerateBuildingOpen(
                true
            );
        };

    /* =======================================================
       BUILDING GENERATED
    ======================================================= */

    const handleBuildingGenerated =
        async (
            buildingId: string
        ) => {
            try {
                setError("");

                const response =
                    await apiFetch(
                        `${API_URL}/property-units/generate`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json",
                            },

                            body: JSON.stringify({
                                building_id:
                                    buildingId,

                                units_per_floor: 4,
                            }),
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.message ||
                        "Property units could not be generated."
                    );
                }

                setGenerateBuildingOpen(
                    false
                );

                setSelectedBuildingId(
                    buildingId
                );

                await loadDashboardData();

                window.alert(
                    `Building generated successfully.\n\nProperty Units: ${data.total_units}`
                );
            } catch (
            generationError
            ) {
                console.error(
                    "Property unit generation error:",
                    generationError
                );

                window.alert(
                    generationError instanceof Error
                        ? generationError.message
                        : "Building was created, but property units could not be generated."
                );
            }
        };

    /* =======================================================
       STRUCTURE MANAGER ACTIONS
    ======================================================= */

    const resetStructureForm = () => {
        setStructureForm({
            name: "",
            type: "",
            area: "",
            width: "",
            length: "",
            location: "",
            covered: false,
        });
        setStructureActionError("");
    };

    const openStructureAction = (
        action: StructureAction,
        target?: {
            floorId?: string;
            unitId?: string;
            roomId?: string;
        }
    ) => {
        resetStructureForm();
        setStructureAction(action);
        setStructureTargetFloorId(target?.floorId ?? null);
        setStructureTargetUnitId(target?.unitId ?? null);
        setStructureTargetRoomId(target?.roomId ?? null);

        if (action === "CORRIDOR") {
            setStructureForm((current) => ({
                ...current,
                name: "Shared Corridor",
                type: "SHARED",
                width: "2",
                length: "20",
            }));
        } else if (action === "ROOM") {
            setStructureForm((current) => ({
                ...current,
                type: "OTHER",
            }));
        } else if (action === "WASHROOM") {
            setStructureForm((current) => ({
                ...current,
                name: "Attached Washroom",
                type: "ATTACHED",
            }));
        } else {
            setStructureForm((current) => ({
                ...current,
                type: "CAR",
                location: "Ground Floor Common Parking",
                covered: true,
            }));
        }
    };

    const closeStructureAction = () => {
        if (structureSaving) {
            return;
        }

        setStructureAction(null);
        setStructureTargetFloorId(null);
        setStructureTargetUnitId(null);
        setStructureTargetRoomId(null);
        resetStructureForm();
    };

    const submitStructureAction = async () => {
        if (!structureAction || !selectedBuildingId) {
            return;
        }

        try {
            setStructureSaving(true);
            setStructureActionError("");

            let endpoint = "";
            let body: Record<string, unknown> = {};

            if (structureAction === "CORRIDOR") {
                if (!structureTargetFloorId || !structureForm.name.trim()) {
                    throw new Error("Floor and corridor name are required.");
                }

                endpoint = `${API_URL}/building-structure/corridors`;
                body = {
                    floor_id: structureTargetFloorId,
                    corridor_name: structureForm.name.trim(),
                    corridor_type: structureForm.type || "SHARED",
                    width_m: structureForm.width ? Number(structureForm.width) : null,
                    length_m: structureForm.length ? Number(structureForm.length) : null,
                };
            } else if (structureAction === "ROOM") {
                if (!structureTargetUnitId || !structureForm.name.trim()) {
                    throw new Error("Apartment and room name are required.");
                }

                endpoint = `${API_URL}/building-structure/rooms`;
                body = {
                    property_unit_id: structureTargetUnitId,
                    room_name: structureForm.name.trim(),
                    room_type: structureForm.type || "OTHER",
                    area_sq_m: structureForm.area ? Number(structureForm.area) : null,
                };
            } else if (structureAction === "WASHROOM") {
                if (!structureTargetRoomId || !structureForm.name.trim()) {
                    throw new Error("Room and washroom name are required.");
                }

                endpoint = `${API_URL}/building-structure/washrooms`;
                body = {
                    room_id: structureTargetRoomId,
                    washroom_name: structureForm.name.trim(),
                    washroom_type: structureForm.type || "ATTACHED",
                    area_sq_m: structureForm.area ? Number(structureForm.area) : null,
                };
            } else {
                if (!structureForm.name.trim()) {
                    throw new Error("Parking number is required.");
                }

                endpoint = `${API_URL}/building-structure/parking`;
                body = {
                    building_id: selectedBuildingId,
                    parking_number: structureForm.name.trim(),
                    parking_type: structureForm.type || "CAR",
                    parking_location: structureForm.location.trim() || null,
                    area_sq_m: structureForm.area ? Number(structureForm.area) : null,
                    is_covered: structureForm.covered,
                    property_unit_id: null,
                };
            }

            const response = await apiFetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || "Structure item could not be created."
                );
            }

            closeStructureAction();
            await loadBuildingStructure(selectedBuildingId);
        } catch (actionError) {
            console.error("Structure manager error:", actionError);
            setStructureActionError(
                actionError instanceof Error
                    ? actionError.message
                    : "Structure item could not be created."
            );
        } finally {
            setStructureSaving(false);
        }
    };

    const deleteStructureItem = async (
        type: "corridor" | "room" | "washroom" | "parking",
        id: string
    ) => {
        const labels = {
            corridor: "corridor",
            room: "room",
            washroom: "washroom",
            parking: "parking space",
        };

        if (!window.confirm(`Delete this ${labels[type]}?`)) {
            return;
        }

        try {
            setStructureError("");

            const response = await apiFetch(
                `${API_URL}/building-structure/${type}s/${id}`,
                { method: "DELETE" }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || `The ${labels[type]} could not be deleted.`
                );
            }

            if (selectedBuildingId) {
                await loadBuildingStructure(selectedBuildingId);
            }
        } catch (deleteError) {
            console.error("Structure delete error:", deleteError);
            setStructureError(
                deleteError instanceof Error
                    ? deleteError.message
                    : "Structure item could not be deleted."
            );
        }
    };

    const assignParking = async (
        parkingId: string,
        propertyUnitId: string | null
    ) => {
        try {
            setStructureError("");

            const response = await apiFetch(
                `${API_URL}/building-structure/parking/${parkingId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        property_unit_id: propertyUnitId,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || "Parking assignment could not be updated."
                );
            }

            if (selectedBuildingId) {
                await loadBuildingStructure(selectedBuildingId);
            }
        } catch (assignmentError) {
            console.error("Parking assignment error:", assignmentError);
            setStructureError(
                assignmentError instanceof Error
                    ? assignmentError.message
                    : "Parking assignment could not be updated."
            );
        }
    };

    /* =======================================================
       LOGOUT
    ======================================================= */

    const handleLogout =
        () => {
            clearAuthData();

            setAuthUser(null);

            navigate("/login", {
                replace: true,
            });
        };

    /* =======================================================
       OPEN 3D EXPLORER
    ======================================================= */

    const open3DExplorer =
        (
            building: Building
        ) => {
            navigate(
                `/dashboard?buildingId=${encodeURIComponent(
                    building.id
                )}`
            );
        };

    /* =======================================================
       FIND PARCEL
    ======================================================= */

    const findBuildingParcel =
        (
            building: Building
        ) => {
            return (
                parcels.find(
                    (parcel) =>
                        parcel.id ===
                        building.parcel_id
                ) ?? null
            );
        };

    /* =======================================================
       BUILDING UNITS
    ======================================================= */

    const getBuildingUnits =
        (
            buildingId: string
        ) => {
            return propertyUnits
                .filter(
                    (unit) =>
                        unit.building_id ===
                        buildingId
                )
                .sort(
                    (
                        first,
                        second
                    ) => {
                        if (
                            first.floor_number !==
                            second.floor_number
                        ) {
                            return (
                                first.floor_number -
                                second.floor_number
                            );
                        }

                        return first.unit_number.localeCompare(
                            second.unit_number,
                            undefined,
                            {
                                numeric: true,
                            }
                        );
                    }
                );
        };

    /* =======================================================
       RENDER
    ======================================================= */

    if (!authUser) {
        return null;
    }

    return (
        <div className="surveyor-dashboard">

            {/* =================================================
          HEADER
      ================================================= */}

            <header className="surveyor-header">

                <div className="surveyor-header-brand">

                    <div className="surveyor-logo">
                        🛰
                    </div>

                    <div>
                        <div className="surveyor-logo-title">
                            3D ULPIN
                        </div>

                        <div className="surveyor-logo-subtitle">
                            Surveyor Property Portal
                        </div>
                    </div>

                </div>

                <div className="surveyor-header-user">

                    <div className="surveyor-user-info">

                        <strong>
                            {authUser.name}
                        </strong>

                        <span>
                            {authUser.role}
                        </span>

                    </div>

                    <button
                        type="button"
                        className="surveyor-logout"
                        onClick={
                            handleLogout
                        }
                    >
                        ↪ Logout
                    </button>

                </div>

            </header>

            {/* =================================================
          MAIN CONTENT
      ================================================= */}

            <main className="surveyor-content">

                {/* =================================================
            HERO
        ================================================= */}

                <section className="surveyor-hero">

                    <div>

                        <div className="surveyor-label">
                            SURVEYOR CONTROL CENTER
                        </div>

                        <h1>
                            Building Management
                        </h1>

                        <p>
                            Generate, inspect and manage
                            digital 3D cadastral buildings.
                        </p>

                    </div>

                    <button
                        type="button"
                        className="primary-action"
                        onClick={
                            openGenerateBuilding
                        }
                    >
                        <span>＋</span>
                        Generate New Building
                    </button>

                </section>

                {/* =================================================
            SEARCH
        ================================================= */}

                <section className="surveyor-search-panel">

                    <div className="search-panel-title">
                        <div className="surveyor-label">
                            PROPERTY SEARCH
                        </div>

                        <h2>
                            Find Building
                        </h2>

                        <p>
                            Search using building name,
                            ULPIN or vertical property ID.
                        </p>
                    </div>

                    <div className="surveyor-search-row">

                        <div className="search-input-wrapper">

                            <span className="search-icon">
                                ⌕
                            </span>

                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) =>
                                    setSearchQuery(
                                        event.target.value
                                    )
                                }
                                onKeyDown={(event) => {
                                    if (
                                        event.key ===
                                        "Enter"
                                    ) {
                                        handleSearch();
                                    }
                                }}
                                placeholder="Search Building Name / ULPIN / VPIN"
                                aria-label="Search building"
                            />

                            {searchQuery && (
                                <button
                                    type="button"
                                    className="search-clear"
                                    onClick={
                                        clearSearch
                                    }
                                    aria-label="Clear search"
                                >
                                    ×
                                </button>
                            )}

                        </div>

                        <button
                            type="button"
                            className="search-button"
                            onClick={
                                handleSearch
                            }
                        >
                            Search
                        </button>

                        {submittedSearch && (
                            <button
                                type="button"
                                className="search-reset-button"
                                onClick={
                                    clearSearch
                                }
                            >
                                Clear
                            </button>
                        )}

                    </div>

                    {submittedSearch && (
                        <div className="search-result-info">

                            <span>
                                Search results for
                            </span>

                            <strong>
                                "{submittedSearch}"
                            </strong>

                            <span>
                                · {searchedBuildings.length}{" "}
                                {searchedBuildings.length ===
                                    1
                                    ? "building"
                                    : "buildings"}{" "}
                                found
                            </span>

                        </div>
                    )}

                </section>

                {/* =================================================
            ERROR
        ================================================= */}

                {error && (
                    <div className="surveyor-error">

                        <div>

                            <strong>
                                Unable to load dashboard
                            </strong>

                            <span>
                                {error}
                            </span>

                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                void loadDashboardData();
                            }}
                        >
                            Refresh
                        </button>

                    </div>
                )}

                {/* =================================================
            STATISTICS
        ================================================= */}

                <section className="surveyor-stat-grid">

                    <div className="surveyor-stat-card">

                        <div className="stat-symbol">
                            🏢
                        </div>

                        <div className="stat-content">

                            <span>
                                TOTAL BUILDINGS
                            </span>

                            <strong>
                                {loading
                                    ? "—"
                                    : totalBuildings}
                            </strong>

                        </div>

                    </div>

                    <div className="surveyor-stat-card">

                        <div className="stat-symbol">
                            🏬
                        </div>

                        <div className="stat-content">

                            <span>
                                TOTAL FLOORS
                            </span>

                            <strong>
                                {loading
                                    ? "—"
                                    : totalFloors}
                            </strong>

                        </div>

                    </div>

                    <div className="surveyor-stat-card">

                        <div className="stat-symbol">
                            🚪
                        </div>

                        <div className="stat-content">

                            <span>
                                TOTAL APARTMENTS
                            </span>

                            <strong>
                                {loading
                                    ? "—"
                                    : totalApartments}
                            </strong>

                        </div>

                    </div>

                    <div className="surveyor-stat-card">

                        <div className="stat-symbol">
                            📍
                        </div>

                        <div className="stat-content">

                            <span>
                                MAPPED PARCELS
                            </span>

                            <strong>
                                {loading
                                    ? "—"
                                    : mappedParcels}
                            </strong>

                        </div>

                    </div>

                </section>

                {/* =================================================
            INVENTORY
        ================================================= */}

                <section className="inventory-section">

                    <div className="inventory-header">

                        <div>

                            <div className="surveyor-label">
                                CADASTRAL INVENTORY
                            </div>

                            <h2>
                                Buildings
                            </h2>

                            <p>
                                Manage generated buildings
                                and their vertical property
                                structures.
                            </p>

                        </div>

                        <div className="inventory-count">
                            {submittedSearch
                                ? `${searchedBuildings.length} ${searchedBuildings.length ===
                                    1
                                    ? "result"
                                    : "results"
                                }`
                                : `${buildings.length} ${buildings.length ===
                                    1
                                    ? "building"
                                    : "buildings"
                                }`}
                        </div>

                    </div>

                    {/* =================================================
              LOADING
          ================================================= */}

                    {loading ? (
                        <div className="surveyor-loading">

                            <div className="loading-spinner" />

                            <span>
                                Loading cadastral buildings...
                            </span>

                        </div>
                    ) : searchedBuildings.length ===
                        0 ? (
                        <div className="surveyor-empty">

                            <div className="empty-symbol">
                                {submittedSearch
                                    ? "⌕"
                                    : "🏗️"}
                            </div>

                            <h3>
                                {submittedSearch
                                    ? "No Buildings Found"
                                    : "No Buildings Found"}
                            </h3>

                            <p>
                                {submittedSearch
                                    ? `No building matched "${submittedSearch}". Try a building name, ULPIN or VPIN.`
                                    : "Generate your first building to start creating the 3D property structure."}
                            </p>

                            {submittedSearch ? (
                                <button
                                    type="button"
                                    onClick={
                                        clearSearch
                                    }
                                >
                                    Show All Buildings
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={
                                        openGenerateBuilding
                                    }
                                >
                                    Generate First Building
                                </button>
                            )}

                        </div>
                    ) : (
                        <div className="building-list">

                            {searchedBuildings.map(
                                (
                                    building
                                ) => {
                                    const apartmentCount =
                                        apartmentCountByBuilding.get(
                                            building.id
                                        ) ?? 0;

                                    const state =
                                        building.state?.trim() ||
                                        "State Not Available";

                                    const district =
                                        building.district?.trim() ||
                                        "District Not Available";

                                    const city =
                                        building.city?.trim() ||
                                        "City Not Available";

                                    const parcel =
                                        findBuildingParcel(
                                            building
                                        );

                                    const address =
                                        [
                                            building.address_line,
                                            building.street,
                                            building.area,
                                            building.city,
                                            building.district,
                                            building.state,
                                            building.pincode,
                                        ]
                                            .filter(
                                                (
                                                    value
                                                ) =>
                                                    Boolean(
                                                        value?.trim()
                                                    )
                                            )
                                            .join(", ");

                                    const isSelected =
                                        selectedBuildingId ===
                                        building.id;

                                    const buildingUnits =
                                        getBuildingUnits(
                                            building.id
                                        );

                                    const buildingHasUnits =
                                        buildingUnits.length >
                                        0;

                                    return (
                                        <article
                                            key={
                                                building.id
                                            }
                                            className={`building-card ${isSelected
                                                ? "building-card-selected"
                                                : ""
                                                }`}
                                        >

                                            {/* ==========================
                          STATE
                      ========================== */}

                                            <div className="building-card-top">

                                                <div className="state-tag">
                                                    {state}
                                                </div>

                                                <div className="ready-badge">
                                                    <span />
                                                    3D READY
                                                </div>

                                            </div>

                                            {/* ==========================
                          BUILDING NAME
                      ========================== */}

                                            <div className="building-title-row">

                                                <div>

                                                    <h3>
                                                        {
                                                            building.building_name
                                                        }
                                                    </h3>

                                                    <div className="building-location">
                                                        📍 {district},{" "}
                                                        {city}
                                                    </div>

                                                </div>

                                            </div>

                                            {/* ==========================
                          DETAILS
                      ========================== */}

                                            <div className="building-info-grid">

                                                <div className="building-info-item">

                                                    <span>
                                                        ULPIN
                                                    </span>

                                                    <strong>
                                                        {
                                                            building.ulpin
                                                        }
                                                    </strong>

                                                </div>

                                                <div className="building-info-item">

                                                    <span>
                                                        FLOORS
                                                    </span>

                                                    <strong>
                                                        {
                                                            building.floors
                                                        }
                                                    </strong>

                                                </div>

                                                <div className="building-info-item">

                                                    <span>
                                                        APARTMENTS
                                                    </span>

                                                    <strong>
                                                        {
                                                            apartmentCount
                                                        }
                                                    </strong>

                                                </div>

                                                <div className="building-info-item">

                                                    <span>
                                                        FLOOR HEIGHT
                                                    </span>

                                                    <strong>
                                                        {
                                                            building.floor_height_m
                                                        }{" "}
                                                        m
                                                    </strong>

                                                </div>

                                            </div>

                                            {/* ==========================
                          ADDRESS
                      ========================== */}

                                            <div className="building-address">

                                                <span>
                                                    ADDRESS
                                                </span>

                                                <p>
                                                    {address ||
                                                        state ||
                                                        "Address not available"}
                                                </p>

                                            </div>

                                            {/* ==========================
                          PARCEL INFO
                      ========================== */}

                                            <div className="building-parcel">

                                                <div>

                                                    <span>
                                                        PARCEL
                                                    </span>

                                                    <strong>
                                                        {
                                                            building.parcel_number ??
                                                            parcel?.parcel_number ??
                                                            "N/A"
                                                        }
                                                    </strong>

                                                </div>

                                                <div>

                                                    <span>
                                                        BASE ELEVATION
                                                    </span>

                                                    <strong>
                                                        {
                                                            building.base_elevation_m
                                                        }{" "}
                                                        m
                                                    </strong>

                                                </div>

                                            </div>

                                            {/* ==========================
                          SEARCH MATCH
                      ========================== */}

                                            {submittedSearch &&
                                                buildingUnits.some(
                                                    (unit) =>
                                                        unit.vertical_property_id
                                                            .toLowerCase()
                                                            .includes(
                                                                submittedSearch
                                                                    .toLowerCase()
                                                            )
                                                ) && (
                                                    <div className="search-match-badge">
                                                        VPIN MATCH FOUND
                                                    </div>
                                                )}

                                            {/* ==========================
                          ACTIONS
                      ========================== */}

                                            <div className="building-actions">

                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    onClick={() => {
                                                        open3DExplorer(
                                                            building
                                                        );
                                                    }}
                                                >
                                                    ◇ View 3D Explorer
                                                </button>

                                                <button
                                                    type="button"
                                                    className="outline-action"
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setSelectedBuildingId(null);
                                                            setBuildingStructure(null);
                                                            setStructureError("");
                                                            return;
                                                        }

                                                        setSelectedBuildingId(building.id);
                                                        void loadBuildingStructure(building.id);
                                                    }}
                                                >
                                                    {isSelected
                                                        ? "Hide Structure"
                                                        : "View Structure →"}
                                                </button>

                                            </div>

                                            {/* =================================================
                          BUILDING STRUCTURE
                      ================================================= */}

                                            {isSelected && (
                                                <div className="structure-panel">
                                                    <div className="structure-heading">
                                                        BUILDING STRUCTURE MANAGER
                                                    </div>

                                                    {structureLoading && !buildingStructure ? (
                                                        <div className="surveyor-loading">
                                                            <div className="loading-spinner" />
                                                            <span>Loading live building structure...</span>
                                                        </div>
                                                    ) : structureError ? (
                                                        <div className="structure-warning">
                                                            <strong>Unable to load structure</strong>
                                                            <span>{structureError}</span>
                                                            <button type="button" onClick={() => void loadBuildingStructure(building.id)}>
                                                                Retry
                                                            </button>
                                                        </div>
                                                    ) : buildingStructure?.building.id !== building.id ? (
                                                        <div className="surveyor-loading">
                                                            <div className="loading-spinner" />
                                                            <span>Loading live building structure...</span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="structure-summary">
                                                                <div><span>FLOORS</span><strong>{buildingStructure.floors.length}</strong></div>
                                                                <div><span>APARTMENTS</span><strong>{buildingStructure.floors.reduce((total, floor) => total + floor.apartments.length, 0)}</strong></div>
                                                                <div><span>CORRIDORS</span><strong>{buildingStructure.floors.reduce((total, floor) => total + floor.corridors.length, 0)}</strong></div>
                                                                <div><span>PARKING</span><strong>{buildingStructure.parking.length}</strong></div>
                                                            </div>

                                                            <div style={{
                                                                margin: "14px 0",
                                                                padding: "12px 14px",
                                                                borderRadius: "12px",
                                                                border: "1px solid rgba(255,255,255,0.08)",
                                                                background: "rgba(255,255,255,0.025)"
                                                            }}>
                                                                <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                                                                    STRUCTURE MANAGER
                                                                </div>
                                                                <div style={{ marginTop: "5px", fontSize: "12px", opacity: 0.65 }}>
                                                                    Add and manage the physical hierarchy of this building.
                                                                </div>
                                                            </div>

                                                            <div className="structure-tree">
                                                                <div className="structure-root">
                                                                    <div className="structure-root-title">🏢 {buildingStructure.building.building_name}</div>
                                                                    <span>ULPIN: {buildingStructure.building.parcel?.ulpin || building.ulpin}</span>
                                                                </div>

                                                                <div style={{ margin: "14px 0", padding: "14px 16px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", background: "rgba(255,255,255,0.025)" }}>
                                                                    <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "6px" }}>Address</div>
                                                                    <div style={{ fontSize: "13px", lineHeight: 1.6 }}>
                                                                        {[
                                                                            buildingStructure.building.address.address_line,
                                                                            buildingStructure.building.address.street,
                                                                            buildingStructure.building.address.area,
                                                                            buildingStructure.building.address.city,
                                                                            buildingStructure.building.address.district,
                                                                            buildingStructure.building.address.state,
                                                                            buildingStructure.building.address.pincode,
                                                                        ].filter((value) => Boolean(value?.trim())).join(", ") || "Address not available"}
                                                                    </div>
                                                                </div>

                                                                <div className="floor-structure-list">
                                                                    {buildingStructure.floors.slice().sort((a, b) => b.floor_number - a.floor_number).map((floor) => (
                                                                        <div key={floor.id} className="floor-structure">
                                                                            <div className="floor-header">
                                                                                <div>
                                                                                    <span className="floor-icon">🏬</span>
                                                                                    <strong>{floor.floor_label || `Floor ${floor.floor_number}`}</strong>
                                                                                </div>
                                                                                <span className="floor-apartment-count">{floor.apartments.length} {floor.apartments.length === 1 ? "Apartment" : "Apartments"}</span>
                                                                            </div>

                                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", margin: "8px 0" }}>
                                                                                <span style={{ fontSize: "11px", opacity: 0.62 }}>Z: {floor.min_z} m → {floor.max_z} m</span>
                                                                                <button type="button" className="outline-action" style={{ padding: "6px 9px", fontSize: "11px" }} onClick={() => openStructureAction("CORRIDOR", { floorId: floor.id })}>+ Corridor</button>
                                                                            </div>

                                                                            {floor.corridors.length > 0 ? (
                                                                                <div style={{ display: "grid", gap: "6px", marginBottom: "10px" }}>
                                                                                    {floor.corridors.map((corridor) => (
                                                                                        <div key={corridor.id} className="corridor-row" style={{ margin: 0 }}>
                                                                                            <div className="corridor-line" />
                                                                                            <div className="corridor-content" style={{ flex: 1 }}>
                                                                                                <span>↔</span>
                                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                                    <strong>{corridor.corridor_name}</strong>
                                                                                                    <small>{formatStructureType(corridor.corridor_type)}{corridor.width_m != null && corridor.length_m != null ? ` · ${corridor.width_m} m × ${corridor.length_m} m` : ""}</small>
                                                                                                </div>
                                                                                                <button type="button" onClick={() => void deleteStructureItem("corridor", corridor.id)} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontSize: "16px", opacity: 0.65 }} aria-label={`Delete ${corridor.corridor_name}`}>×</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="no-apartments-floor" style={{ marginBottom: "10px" }}><span>No corridor configured on this floor</span></div>
                                                                            )}

                                                                            {floor.apartments.length > 0 ? (
                                                                                <div className="apartment-structure-list">
                                                                                    {floor.apartments.map((apartment) => (
                                                                                        <div key={apartment.id} className="apartment-structure" style={{ alignItems: "flex-start" }}>
                                                                                            <div className="apartment-icon">🚪</div>
                                                                                            <div className="apartment-main" style={{ minWidth: 0, flex: 1 }}>
                                                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                                                                                                    <div>
                                                                                                        <strong>Apartment {apartment.unit_number}</strong>
                                                                                                        <span>VPIN: {apartment.vertical_property_id}</span>
                                                                                                    </div>
                                                                                                    <button type="button" className="outline-action" style={{ padding: "5px 8px", fontSize: "10px" }} onClick={() => openStructureAction("ROOM", { unitId: apartment.id })}>+ Room</button>
                                                                                                </div>

                                                                                                {apartment.rooms.length > 0 ? (
                                                                                                    <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
                                                                                                        {apartment.rooms.map((room) => (
                                                                                                            <div key={room.id} style={{ padding: "9px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                                                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                                                                                                                    <div style={{ minWidth: 0 }}>
                                                                                                                        <strong style={{ display: "block", fontSize: "12px" }}>🛋️ {room.room_name}</strong>
                                                                                                                        <small style={{ opacity: 0.65 }}>{formatStructureType(room.room_type)} · {room.area_sq_m != null ? `${room.area_sq_m} m²` : "Area N/A"}</small>
                                                                                                                    </div>
                                                                                                                    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                                                                                        <button type="button" onClick={() => openStructureAction("WASHROOM", { roomId: room.id })} style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "10px" }}>+ Washroom</button>
                                                                                                                        <button type="button" onClick={() => void deleteStructureItem("room", room.id)} style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "10px" }}>Delete</button>
                                                                                                                    </div>
                                                                                                                </div>

                                                                                                                {room.washrooms.length > 0 ? (
                                                                                                                    <div style={{ marginTop: "7px", paddingLeft: "8px", display: "grid", gap: "4px" }}>
                                                                                                                        {room.washrooms.map((washroom) => (
                                                                                                                            <div key={washroom.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "11px", opacity: 0.82 }}>
                                                                                                                                <span>🚿 {washroom.washroom_name}</span>
                                                                                                                                <span>
                                                                                                                                    {formatStructureType(washroom.washroom_type)}{washroom.area_sq_m != null ? ` · ${washroom.area_sq_m} m²` : ""}
                                                                                                                                    <button type="button" onClick={() => void deleteStructureItem("washroom", washroom.id)} style={{ marginLeft: "6px", border: 0, background: "transparent", color: "inherit", cursor: "pointer", opacity: 0.7 }} aria-label={`Delete ${washroom.washroom_name}`}>×</button>
                                                                                                                                </span>
                                                                                                                            </div>
                                                                                                                        ))}
                                                                                                                    </div>
                                                                                                                ) : (
                                                                                                                    <small style={{ display: "block", marginTop: "7px", opacity: 0.5 }}>No washroom configured</small>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <div style={{ marginTop: "8px", fontSize: "11px", opacity: 0.5 }}>No rooms configured yet.</div>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className="apartment-area">{apartment.area_sq_m != null ? `${apartment.area_sq_m} m²` : "—"}</div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="no-apartments-floor"><span>No apartments generated on this floor</span></div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            <div style={{ marginTop: "16px", padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                                                                    <div>
                                                                        <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>PARKING INVENTORY</div>
                                                                        <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "3px" }}>Common parking can be assigned to any apartment.</div>
                                                                    </div>
                                                                    <button type="button" className="outline-action" style={{ padding: "6px 9px", fontSize: "11px" }} onClick={() => openStructureAction("PARKING")}>+ Parking</button>
                                                                </div>

                                                                {buildingStructure.parking.length > 0 ? (
                                                                    <div style={{ display: "grid", gap: "7px" }}>
                                                                        {buildingStructure.parking.map((space) => (
                                                                            <div key={space.id} style={{ padding: "10px", borderRadius: "8px", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                                                                                    <div>
                                                                                        <strong>🚗 {space.parking_number}</strong>
                                                                                        <small style={{ display: "block", opacity: 0.65, marginTop: "2px" }}>{formatStructureType(space.parking_type)}{space.parking_location ? ` · ${space.parking_location}` : ""}{space.area_sq_m != null ? ` · ${space.area_sq_m} m²` : ""}{space.is_covered ? " · Covered" : " · Open"}</small>
                                                                                    </div>
                                                                                    <button type="button" onClick={() => void deleteStructureItem("parking", space.id)} style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "10px" }}>Delete</button>
                                                                                </div>
                                                                                <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                                                                    <span style={{ fontSize: "10px", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em" }}>Assigned apartment</span>
                                                                                    <select value={space.assigned_apartment?.property_unit_id ?? ""} onChange={(event) => void assignParking(space.id, event.target.value || null)} style={{ flex: "1 1 220px", minWidth: 0, padding: "7px 8px", borderRadius: "7px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.18)", color: "inherit" }}>
                                                                                        <option value="">Available / Common</option>
                                                                                        {buildingStructure.floors.flatMap((structureFloor) => structureFloor.apartments).map((apartment) => (
                                                                                            <option key={apartment.id} value={apartment.id}>Apartment {apartment.unit_number} · {apartment.vertical_property_id}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="structure-warning" style={{ margin: 0 }}>No parking spaces configured yet.</div>
                                                                )}
                                                            </div>

                                                            <div className="structure-modules">
                                                                <div className="structure-module">
                                                                    <div className="module-icon">🛋️</div>
                                                                    <div>
                                                                        <strong>Rooms & Washrooms</strong>
                                                                        <span>{buildingStructure.floors.reduce((total, floor) => total + floor.apartments.reduce((sum, apartment) => sum + apartment.rooms.length, 0), 0)} rooms configured</span>
                                                                    </div>
                                                                    <small>LIVE</small>
                                                                </div>
                                                                <div className="structure-module">
                                                                    <div className="module-icon">🚗</div>
                                                                    <div>
                                                                        <strong>Parking</strong>
                                                                        <span>{buildingStructure.parking.filter((space) => space.assigned_apartment === null).length} available · {buildingStructure.parking.filter((space) => space.assigned_apartment !== null).length} assigned</span>
                                                                    </div>
                                                                    <small>LIVE</small>
                                                                </div>
                                                            </div>

                                                            {!buildingHasUnits && (
                                                                <div className="structure-warning">
                                                                    This building has floors but no property units yet. Generate property units to create the apartment structure.
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                        </article>
                                    );
                                }
                            )}

                        </div>
                    )}

                </section>

            </main>

            {/* =================================================
          STRUCTURE ACTION MODAL
      ================================================= */}

            {structureAction && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="structure-action-title"
                    style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(2, 8, 23, 0.78)", backdropFilter: "blur(6px)" }}
                    onMouseDown={(event) => {
                        if (event.currentTarget === event.target) {
                            closeStructureAction();
                        }
                    }}
                >
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void submitStructureAction();
                        }}
                        style={{ width: "min(520px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: "22px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.12)", background: "#0b1730", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                            <div>
                                <div className="surveyor-label">STRUCTURE MANAGER</div>
                                <h2 id="structure-action-title" style={{ margin: "5px 0 6px" }}>
                                    Add {structureAction === "CORRIDOR" ? "Corridor" : structureAction === "ROOM" ? "Room" : structureAction === "WASHROOM" ? "Washroom" : "Parking"}
                                </h2>
                                <p style={{ margin: 0, opacity: 0.65, fontSize: "12px" }}>Save this element directly to the building structure.</p>
                            </div>
                            <button type="button" onClick={closeStructureAction} style={{ border: 0, background: "transparent", color: "inherit", fontSize: "22px", cursor: "pointer" }} aria-label="Close">×</button>
                        </div>

                        {structureActionError && <div className="structure-warning" style={{ marginTop: "14px" }}>{structureActionError}</div>}

                        <div style={{ display: "grid", gap: "13px", marginTop: "18px" }}>
                            <label style={{ display: "grid", gap: "6px" }}>
                                <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{structureAction === "PARKING" ? "Parking Number" : "Name"}</span>
                                <input autoFocus required value={structureForm.name} onChange={(event) => setStructureForm((current) => ({ ...current, name: event.target.value }))} placeholder={structureAction === "CORRIDOR" ? "Floor 1 Shared Corridor" : structureAction === "ROOM" ? "Bedroom 1" : structureAction === "WASHROOM" ? "Bedroom 1 Attached Washroom" : "P-01"} style={{ padding: "10px 11px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "inherit" }} />
                            </label>

                            <label style={{ display: "grid", gap: "6px" }}>
                                <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Type</span>
                                <select value={structureForm.type} onChange={(event) => setStructureForm((current) => ({ ...current, type: event.target.value }))} style={{ padding: "10px 11px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.12)", background: "#0b1730", color: "inherit" }}>
                                    {structureAction === "CORRIDOR" && <><option value="SHARED">Shared</option><option value="PRIVATE">Private</option><option value="SERVICE">Service</option></>}
                                    {structureAction === "ROOM" && <><option value="LIVING_ROOM">Living Room</option><option value="BEDROOM">Bedroom</option><option value="KITCHEN">Kitchen</option><option value="DINING_ROOM">Dining Room</option><option value="STUDY_ROOM">Study Room</option><option value="BALCONY">Balcony</option><option value="STORE_ROOM">Store Room</option><option value="UTILITY_ROOM">Utility Room</option><option value="OTHER">Other</option></>}
                                    {structureAction === "WASHROOM" && <><option value="ATTACHED">Attached</option><option value="COMMON">Common</option><option value="GUEST">Guest</option><option value="SERVICE">Service</option></>}
                                    {structureAction === "PARKING" && <><option value="CAR">Car</option><option value="BIKE">Bike</option><option value="EV">EV</option><option value="OTHER">Other</option></>}
                                </select>
                            </label>

                            {(structureAction === "ROOM" || structureAction === "WASHROOM" || structureAction === "PARKING") && (
                                <label style={{ display: "grid", gap: "6px" }}>
                                    <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Area (m²)</span>
                                    <input type="number" min="0" step="0.01" value={structureForm.area} onChange={(event) => setStructureForm((current) => ({ ...current, area: event.target.value }))} placeholder="e.g. 20" style={{ padding: "10px 11px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "inherit" }} />
                                </label>
                            )}

                            {structureAction === "CORRIDOR" && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                    <label style={{ display: "grid", gap: "6px" }}><span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Width (m)</span><input type="number" min="0" step="0.01" value={structureForm.width} onChange={(event) => setStructureForm((current) => ({ ...current, width: event.target.value }))} style={{ padding: "10px 11px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "inherit" }} /></label>
                                    <label style={{ display: "grid", gap: "6px" }}><span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Length (m)</span><input type="number" min="0" step="0.01" value={structureForm.length} onChange={(event) => setStructureForm((current) => ({ ...current, length: event.target.value }))} style={{ padding: "10px 11px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "inherit" }} /></label>
                                </div>
                            )}

                            {structureAction === "PARKING" && <>
                                <label style={{ display: "grid", gap: "6px" }}><span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Location</span><input value={structureForm.location} onChange={(event) => setStructureForm((current) => ({ ...current, location: event.target.value }))} placeholder="Ground Floor Common Parking" style={{ padding: "10px 11px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "inherit" }} /></label>
                                <label style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "12px" }}><input type="checkbox" checked={structureForm.covered} onChange={(event) => setStructureForm((current) => ({ ...current, covered: event.target.checked }))} /> Covered parking</label>
                            </>}
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                            <button type="button" className="search-reset-button" onClick={closeStructureAction} disabled={structureSaving}>Cancel</button>
                            <button type="submit" className="primary-action" disabled={structureSaving} style={{ border: 0 }}>{structureSaving ? "Saving..." : "Save Structure"}</button>
                        </div>
                    </form>
                </div>
            )}

            {/* =================================================
          GENERATE BUILDING MODAL
      ================================================= */}

            <GenerateBuildingModal
                open={
                    generateBuildingOpen
                }
                parcels={
                    parcels
                }
                selectedParcel={
                    selectedParcel
                }
                onClose={() =>
                    setGenerateBuildingOpen(
                        false
                    )
                }
                onGenerated={
                    handleBuildingGenerated
                }
            />

        </div>
    );
}

export default SurveyorDashboard;