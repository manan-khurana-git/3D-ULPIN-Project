import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { getAuthToken } from "../services/authService";

const API_BASE_URL =
  "http://localhost:5000/api";

type Building = {
  id: string;
  parcel_id: string;
  building_name: string;
  number_of_floors?: number;
  floor_height_m: string | number;
  base_elevation_m: string | number;
  floors: number;
  ulpin: string;
  parcel_number: string | null;
  created_at?: string;
};

type PropertyUnit = {
  id: string;
  floor_id?: string;
  building_id?: string;

  unit_number: string;
  parent_ulpin: string;
  vertical_property_id: string;

  area_sq_m: string | number;
  min_z: string | number;
  max_z: string | number;

  floor_number: number;
  floor_label: string;
};

type Owner = {
  name: string;
  contact: string | null;
  ownership_percentage: number;
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

type RegistryStatus =
  | "UNREGISTERED"
  | "REGISTERED";

type PropertyDetailsResponse = {
  status: string;
  property: {
    id: string;
    vertical_property_id: string;
    parent_ulpin: string;

    unit: {
      number: string;
      floor: number;
      floor_label: string;
      area_sq_m: number;
      min_z: number;
      max_z: number;
    };

    building: {
      id: string;
      name: string;
    };

    owner: Owner | null;

    tax: {
      assessment_year: number;
      assessed_value: number;
      tax_amount: number;
      payment_status: string;
    } | null;

    utilities: {
      utility_type: string;
      connection_number: string;
      provider: string;
      status: string;
    }[];
  };
};

function EditExistingBuilding() {
  const [buildings, setBuildings] =
    useState<Building[]>([]);

  const [propertyUnits, setPropertyUnits] =
    useState<PropertyUnit[]>([]);

  const [selectedBuildingId, setSelectedBuildingId] =
    useState("");

  const [selectedUnitId, setSelectedUnitId] =
    useState("");

  const [selectedFloor, setSelectedFloor] =
    useState<number | null>(null);

  const [searchText, setSearchText] =
    useState("");

  const [isLoadingBuildings, setIsLoadingBuildings] =
    useState(true);

  const [isLoadingUnits, setIsLoadingUnits] =
    useState(false);

  const [error, setError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [propertyOwners, setPropertyOwners] =
    useState<Record<string, Owner>>({});

  const [showRegistrationForm, setShowRegistrationForm] =
    useState(false);

  const [ownerName, setOwnerName] =
    useState("");

  const [ownerContact, setOwnerContact] =
    useState("");

  const [ownershipPercentage, setOwnershipPercentage] =
    useState("100");

  const [registrationDate, setRegistrationDate] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10)
    );

  const [isRegistering, setIsRegistering] =
    useState(false);

  const [showTransferForm, setShowTransferForm] =
    useState(false);

  const [transferOwnerName, setTransferOwnerName] =
    useState("");

  const [transferOwnerContact, setTransferOwnerContact] =
    useState("");

  const [transferOwnershipPercentage, setTransferOwnershipPercentage] =
    useState("100");

  const [transferDate, setTransferDate] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10)
    );

  const [isTransferring, setIsTransferring] =
    useState(false);

  const [ownershipHistory, setOwnershipHistory] =
    useState<OwnershipHistoryRecord[]>([]);

  const [isLoadingHistory, setIsLoadingHistory] =
    useState(false);

  /*
  |--------------------------------------------------------------------------
  | LOAD BUILDINGS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    async function loadBuildings() {
      try {
        setError("");

        const token =
          getAuthToken();

        if (!token) {
          throw new Error(
            "Authentication token not found."
          );
        }

        const response =
          await fetch(
            `${API_BASE_URL}/buildings`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Failed to load buildings."
          );
        }

        const loadedBuildings =
          data.buildings ?? [];

        setBuildings(
          loadedBuildings
        );

        if (
          loadedBuildings.length >
          0
        ) {
          setSelectedBuildingId(
            loadedBuildings[0].id
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load buildings."
        );
      } finally {
        setIsLoadingBuildings(
          false
        );
      }
    }

    void loadBuildings();
  }, []);

  /*
  |--------------------------------------------------------------------------
  | LOAD PROPERTY UNITS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!selectedBuildingId) {
      setPropertyUnits([]);
      setSelectedUnitId("");
      return;
    }

    async function loadPropertyUnits() {
      try {
        setIsLoadingUnits(true);
        setError("");
        setSuccessMessage("");
        setPropertyUnits([]);
        setSelectedUnitId("");
        setPropertyOwners({});

        const token =
          getAuthToken();

        if (!token) {
          throw new Error(
            "Authentication token not found."
          );
        }

        const response =
          await fetch(
            `${API_BASE_URL}/buildings/${selectedBuildingId}/3d`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Failed to load property units."
          );
        }

        setPropertyUnits(
          data.property_units ??
          []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load property units."
        );
      } finally {
        setIsLoadingUnits(
          false
        );
      }
    }

    void loadPropertyUnits();
  }, [selectedBuildingId]);

  /*
  |--------------------------------------------------------------------------
  | LOAD OWNER DETAILS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      propertyUnits.length ===
      0
    ) {
      return;
    }

    async function loadOwnerDetails() {
      const token =
        getAuthToken();

      if (!token) {
        return;
      }

      const owners: Record<
        string,
        Owner
      > = {};

      for (
        const unit of propertyUnits
      ) {
        try {
          const response =
            await fetch(
              `${API_BASE_URL}/property-units/${encodeURIComponent(
                unit.vertical_property_id
              )}`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },
              }
            );

          if (!response.ok) {
            continue;
          }

          const data =
            (await response.json()) as
            PropertyDetailsResponse;

          if (
            data.property?.owner
          ) {
            owners[unit.id] =
              data.property.owner;
          }
        } catch {
          /*
           * Individual property detail
           * failures should not prevent
           * the registry page from loading.
           */
        }
      }

      setPropertyOwners(
        owners
      );
    }

    void loadOwnerDetails();
  }, [propertyUnits]);

  /*
  |--------------------------------------------------------------------------
  | SELECTED BUILDING
  |--------------------------------------------------------------------------
  */

  const selectedBuilding =
    useMemo(
      () =>
        buildings.find(
          (building) =>
            building.id ===
            selectedBuildingId
        ) ?? null,
      [
        buildings,
        selectedBuildingId,
      ]
    );

  /*
  |--------------------------------------------------------------------------
  | FLOORS
  |--------------------------------------------------------------------------
  */

  const floors =
    useMemo(() => {
      return Array.from(
        new Set(
          propertyUnits.map(
            (unit) =>
              unit.floor_number
          )
        )
      ).sort(
        (a, b) => b - a
      );
    }, [propertyUnits]);

  /*
  |--------------------------------------------------------------------------
  | FILTER UNITS
  |--------------------------------------------------------------------------
  */

  const filteredUnits =
    useMemo(() => {
      let units =
        propertyUnits;

      if (
        selectedFloor !== null
      ) {
        units =
          units.filter(
            (unit) =>
              unit.floor_number ===
              selectedFloor
          );
      }

      const query =
        searchText
          .trim()
          .toLowerCase();

      if (query) {
        units =
          units.filter(
            (unit) =>
              unit.unit_number
                .toLowerCase()
                .includes(query) ||
              unit.vertical_property_id
                .toLowerCase()
                .includes(query)
          );
      }

      return units;
    }, [
      propertyUnits,
      selectedFloor,
      searchText,
    ]);

  /*
  |--------------------------------------------------------------------------
  | SELECTED UNIT
  |--------------------------------------------------------------------------
  */

  const selectedUnit =
    useMemo(
      () =>
        propertyUnits.find(
          (unit) =>
            unit.id ===
            selectedUnitId
        ) ?? null,
      [
        propertyUnits,
        selectedUnitId,
      ]
    );

  /*
  |--------------------------------------------------------------------------
  | REGISTRY STATUS
  |--------------------------------------------------------------------------
  */

  function getRegistryStatus(
    unit: PropertyUnit
  ): RegistryStatus {
    return propertyOwners[
      unit.id
    ]
      ? "REGISTERED"
      : "UNREGISTERED";
  }

  /*
  |--------------------------------------------------------------------------
  | CLEAR FILTERS
  |--------------------------------------------------------------------------
  */

  function clearFilters() {
    setSelectedFloor(null);
    setSearchText("");
    setSelectedUnitId("");
  }

  /*
  |--------------------------------------------------------------------------
  | OPEN REGISTRATION FORM
  |--------------------------------------------------------------------------
  */

  function openRegistrationForm() {
    setError("");
    setSuccessMessage("");

    setOwnerName("");
    setOwnerContact("");
    setOwnershipPercentage(
      "100"
    );

    setRegistrationDate(
      new Date()
        .toISOString()
        .slice(0, 10)
    );

    setShowRegistrationForm(
      true
    );
  }

  /*
  |--------------------------------------------------------------------------
  | REGISTER PROPERTY
  |--------------------------------------------------------------------------
  */

  async function registerProperty() {
    if (!selectedUnit) {
      return;
    }

    const cleanName =
      ownerName.trim();

    const cleanContact =
      ownerContact.trim();

    const percentage =
      Number(
        ownershipPercentage
      );

    if (!cleanName) {
      setError(
        "Please enter the owner's full name."
      );
      return;
    }

    if (!Number.isFinite(
      percentage
    ) ||
      percentage <= 0 ||
      percentage > 100
    ) {
      setError(
        "Ownership percentage must be between 0 and 100."
      );
      return;
    }

    try {
      setIsRegistering(
        true
      );

      setError("");
      setSuccessMessage("");

      const token =
        getAuthToken();

      if (!token) {
        throw new Error(
          "Authentication token not found."
        );
      }

      const response =
        await fetch(
          `${API_BASE_URL}/property-units/register`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify({
              property_unit_id:
                selectedUnit.id,

              owner_name:
                cleanName,

              contact:
                cleanContact ||
                null,

              ownership_percentage:
                percentage,

              valid_from:
                registrationDate,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Property registration failed."
        );
      }

      /*
       * Update local owner state
       * immediately.
       */

      setPropertyOwners(
        (current) => ({
          ...current,

          [selectedUnit.id]: {
            name:
              data.property
                .owner.name,

            contact:
              data.property
                .owner.contact,

            ownership_percentage:
              Number(
                data.property
                  .ownership
                  .percentage
              ),
          },
        })
      );

      setShowRegistrationForm(
        false
      );

      setSuccessMessage(
        `Apartment ${selectedUnit.unit_number} has been registered successfully.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Property registration failed."
      );
    } finally {
      setIsRegistering(
        false
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| OPEN TRANSFER FORM
|--------------------------------------------------------------------------
*/

  async function loadOwnershipHistory() {
    if (!selectedUnit) {
      return;
    }

    setIsLoadingHistory(true);
    setError("");

    try {
      const token = getAuthToken();

      if (!token) {
        throw new Error(
          "Authentication token not found."
        );
      }

      const response = await fetch(
        `${API_BASE_URL}/property-units/${encodeURIComponent(
          selectedUnit.vertical_property_id
        )}/history`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Failed to load ownership history."
        );
      }

      setOwnershipHistory(
        data.ownership_history ?? []
      );
    } catch (err) {
      console.error(
        "Ownership history error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load ownership history."
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function openTransferForm() {


    if (!selectedUnit) {
      return;
    }

    const currentOwner =
      propertyOwners[selectedUnit.id];

    setError("");
    setSuccessMessage("");

    setTransferOwnerName("");
    setTransferOwnerContact("");
    setTransferOwnershipPercentage(
      String(
        currentOwner?.ownership_percentage ??
        100
      )
    );

    setTransferDate(
      new Date()
        .toISOString()
        .slice(0, 10)
    );

    setShowTransferForm(true);
  }

  /*
  |--------------------------------------------------------------------------
  | TRANSFER PROPERTY OWNERSHIP
  |--------------------------------------------------------------------------
  */

  async function transferPropertyOwnership() {
    if (!selectedUnit) {
      return;
    }

    const cleanName =
      transferOwnerName.trim();

    const cleanContact =
      transferOwnerContact.trim();

    const percentage =
      Number(
        transferOwnershipPercentage
      );

    if (!cleanName) {
      setError(
        "Please enter the new owner's full name."
      );
      return;
    }

    if (
      !Number.isFinite(percentage) ||
      percentage <= 0 ||
      percentage > 100
    ) {
      setError(
        "Ownership percentage must be between 0 and 100."
      );
      return;
    }

    try {
      setIsTransferring(true);
      setError("");
      setSuccessMessage("");

      const token =
        getAuthToken();

      if (!token) {
        throw new Error(
          "Authentication token not found."
        );
      }

      const response =
        await fetch(
          `${API_BASE_URL}/property-units/transfer`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify({
              property_unit_id:
                selectedUnit.id,

              new_owner_name:
                cleanName,

              new_owner_contact:
                cleanContact ||
                null,

              ownership_percentage:
                percentage,

              transfer_date:
                transferDate,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Ownership transfer failed."
        );
      }

      /*
       * Update current owner immediately.
       */

      setPropertyOwners(
        (current) => ({
          ...current,

          [selectedUnit.id]: {
            name:
              data.current_owner.name,

            contact:
              data.current_owner.contact,

            ownership_percentage:
              Number(
                data.current_owner
                  .ownership_percentage
              ),
          },
        })
      );

      /*
       * Update ownership history
       * returned by the API.
       */

      const history: OwnershipHistoryRecord[] =
        [
          ...(
            data.previous_owners ??
            []
          ).map(
            (
              owner: {
                id: string;
                owner_id?: string;
                name: string;
                contact: string | null;
                ownership_percentage: number;
                valid_from: string;
                valid_to: string;
              }
            ) => ({
              id: owner.id,
              owner_id:
                owner.owner_id ?? owner.id,
              name:
                owner.name,
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
              is_current: false,
            })
          ),

          ...(data.current_owner
            ? [
              {
                id:
                  data.current_owner.id,
                owner_id:
                  data.current_owner.owner_id ??
                  data.current_owner.id,
                name:
                  data.current_owner.name,
                contact:
                  data.current_owner
                    .contact,
                ownership_percentage:
                  Number(
                    data.current_owner
                      .ownership_percentage
                  ),
                valid_from:
                  data.current_owner
                    .valid_from,
                valid_to: null,
                is_current: true,
              },
            ]
            : []),
        ];

      setOwnershipHistory(
        history
      );

      setShowTransferForm(false);

      setSuccessMessage(
        `Ownership of apartment ${selectedUnit.unit_number} has been transferred to ${data.current_owner.name}.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ownership transfer failed."
      );
    } finally {
      setIsTransferring(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (isLoadingBuildings) {
    return (
      <div
        style={
          styles.page
        }
      >
        <div
          style={
            styles.loadingCard
          }
        >
          <div
            style={
              styles.loadingIcon
            }
          >
            ◌
          </div>

          <h2
            style={
              styles.loadingTitle
            }
          >
            Loading Property Registry
          </h2>

          <p
            style={
              styles.loadingText
            }
          >
            Fetching buildings and
            cadastral records...
          </p>
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PAGE
  |--------------------------------------------------------------------------
  */

  return (
    <div
      style={
        styles.page
      }
    >
      {/* HEADER */}

      <div
        style={
          styles.header
        }
      >
        <div>
          <div
            style={
              styles.eyebrow
            }
          >
            3D ULPIN • PROPERTY
            REGISTRY
          </div>

          <h1
            style={
              styles.title
            }
          >
            Edit Existing Building
          </h1>

          <p
            style={
              styles.subtitle
            }
          >
            Manage apartments,
            registration status and
            ownership records.
          </p>
        </div>

        <div
          style={
            styles.headerStats
          }
        >
          <div
            style={
              styles.statCard
            }
          >
            <span
              style={
                styles.statValue
              }
            >
              {buildings.length}
            </span>

            <span
              style={
                styles.statLabel
              }
            >
              Buildings
            </span>
          </div>

          <div
            style={
              styles.statCard
            }
          >
            <span
              style={
                styles.statValue
              }
            >
              {propertyUnits.length}
            </span>

            <span
              style={
                styles.statLabel
              }
            >
              Units
            </span>
          </div>

          <div
            style={
              styles.statCard
            }
          >
            <span
              style={
                styles.statValue
              }
            >
              {
                Object.keys(
                  propertyOwners
                ).length
              }
            </span>

            <span
              style={
                styles.statLabel
              }
            >
              Registered
            </span>
          </div>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div
          style={
            styles.error
          }
        >
          <strong>
            ⚠ Error
          </strong>

          <span>
            {error}
          </span>
        </div>
      )}

      {/* SUCCESS */}

      {successMessage && (
        <div
          style={
            styles.success
          }
        >
          <strong>
            ✓ Success
          </strong>

          <span>
            {successMessage}
          </span>
        </div>
      )}

      {/* BUILDING SELECTOR */}

      <section
        style={
          styles.section
        }
      >
        <div
          style={
            styles.sectionHeader
          }
        >
          <div>
            <div
              style={
                styles.sectionNumber
              }
            >
              01
            </div>

            <div>
              <h2
                style={
                  styles.sectionTitle
                }
              >
                Select Building
              </h2>

              <p
                style={
                  styles.sectionSubtitle
                }
              >
                Choose the building
                whose property records
                you want to manage.
              </p>
            </div>
          </div>
        </div>

        <div
          style={
            styles.buildingGrid
          }
        >
          {buildings.map(
            (building) => {
              const active =
                building.id ===
                selectedBuildingId;

              return (
                <button
                  key={
                    building.id
                  }
                  type="button"
                  onClick={() => {
                    setSelectedBuildingId(
                      building.id
                    );

                    setSelectedFloor(
                      null
                    );

                    setSearchText(
                      ""
                    );

                    setSelectedUnitId(
                      ""
                    );

                    setSuccessMessage(
                      ""
                    );
                  }}
                  style={{
                    ...styles.buildingCard,

                    ...(active
                      ? styles.buildingCardActive
                      : {}),
                  }}
                >
                  <div
                    style={
                      styles.buildingIcon
                    }
                  >
                    🏢
                  </div>

                  <div
                    style={
                      styles.buildingInfo
                    }
                  >
                    <strong>
                      {
                        building.building_name
                      }
                    </strong>

                    <span>
                      ULPIN{" "}
                      {building.ulpin}
                    </span>
                  </div>

                  <div
                    style={
                      styles.buildingArrow
                    }
                  >
                    →
                  </div>
                </button>
              );
            }
          )}
        </div>
      </section>

      {/* BUILDING SUMMARY */}

      {selectedBuilding && (
        <section
          style={
            styles.summaryCard
          }
        >
          <div>
            <div
              style={
                styles.summaryEyebrow
              }
            >
              ACTIVE BUILDING
            </div>

            <h2
              style={
                styles.summaryTitle
              }
            >
              {
                selectedBuilding.building_name
              }
            </h2>
          </div>

          <div
            style={
              styles.summaryStats
            }
          >
            <div>
              <strong>
                {floors.length}
              </strong>

              <span>
                Floors
              </span>
            </div>

            <div>
              <strong>
                {propertyUnits.length}
              </strong>

              <span>
                Units
              </span>
            </div>

            <div>
              <strong>
                {
                  propertyUnits.filter(
                    (unit) =>
                      getRegistryStatus(
                        unit
                      ) ===
                      "REGISTERED"
                  ).length
                }
              </strong>

              <span>
                Registered
              </span>
            </div>
          </div>
        </section>
      )}

      {/* UNIT SECTION */}

      <section
        style={
          styles.section
        }
      >
        <div
          style={
            styles.sectionHeader
          }
        >
          <div>
            <div
              style={
                styles.sectionNumber
              }
            >
              02
            </div>

            <div>
              <h2
                style={
                  styles.sectionTitle
                }
              >
                Property Units
              </h2>

              <p
                style={
                  styles.sectionSubtitle
                }
              >
                Select an apartment to
                view or manage its
                property registration.
              </p>
            </div>
          </div>

          <div
            style={
              styles.filterActions
            }
          >
            <input
              type="text"
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
              placeholder="Search unit or VPID..."
              style={
                styles.searchInput
              }
            />

            <button
              type="button"
              onClick={
                clearFilters
              }
              style={
                styles.clearButton
              }
            >
              Clear
            </button>
          </div>
        </div>

        {/* FLOOR FILTER */}

        <div
          style={
            styles.floorFilters
          }
        >
          <button
            type="button"
            onClick={() =>
              setSelectedFloor(
                null
              )
            }
            style={{
              ...styles.floorButton,

              ...(selectedFloor ===
                null
                ? styles.floorButtonActive
                : {}),
            }}
          >
            ALL FLOORS
          </button>

          {floors.map(
            (floor) => (
              <button
                key={floor}
                type="button"
                onClick={() =>
                  setSelectedFloor(
                    floor
                  )
                }
                style={{
                  ...styles.floorButton,

                  ...(selectedFloor ===
                    floor
                    ? styles.floorButtonActive
                    : {}),
                }}
              >
                F{String(
                  floor
                ).padStart(
                  2,
                  "0"
                )}
              </button>
            )
          )}
        </div>

        {/* UNITS */}

        {isLoadingUnits ? (
          <div
            style={
              styles.unitsLoading
            }
          >
            <div
              style={
                styles.spinner
              }
            >
              ◌
            </div>

            Loading property
            units...
          </div>
        ) : filteredUnits.length ===
          0 ? (
          <div
            style={
              styles.emptyState
            }
          >
            <div
              style={
                styles.emptyIcon
              }
            >
              🏢
            </div>

            <h3
              style={
                styles.emptyTitle
              }
            >
              No units found
            </h3>

            <p
              style={
                styles.emptyText
              }
            >
              Try another floor or
              search term.
            </p>
          </div>
        ) : (
          <div
            style={
              styles.unitGrid
            }
          >
            {filteredUnits.map(
              (unit) => {
                const status =
                  getRegistryStatus(
                    unit
                  );

                const owner =
                  propertyOwners[
                  unit.id
                  ];

                const active =
                  unit.id ===
                  selectedUnitId;

                return (
                  <button
                    key={
                      unit.id
                    }
                    type="button"
                    onClick={() =>
                      setSelectedUnitId(
                        unit.id
                      )
                    }
                    style={{
                      ...styles.unitCard,

                      ...(active
                        ? styles.unitCardActive
                        : {}),
                    }}
                  >
                    <div
                      style={
                        styles.unitCardTop
                      }
                    >
                      <span
                        style={
                          styles.unitNumber
                        }
                      >
                        {
                          unit.unit_number
                        }
                      </span>

                      <span
                        style={{
                          ...styles.statusBadge,

                          ...(status ===
                            "REGISTERED"
                            ? styles.statusRegistered
                            : styles.statusUnregistered),
                        }}
                      >
                        {status}
                      </span>
                    </div>

                    <div
                      style={
                        styles.unitFloor
                      }
                    >
                      {
                        unit.floor_label
                      }
                    </div>

                    <div
                      style={
                        styles.unitVpid
                      }
                    >
                      {
                        unit.vertical_property_id
                      }
                    </div>

                    <div
                      style={
                        styles.unitDetails
                      }
                    >
                      <span>
                        {
                          unit.area_sq_m
                        }{" "}
                        m²
                      </span>

                      <span>
                        Z{" "}
                        {
                          unit.min_z
                        }
                        –
                        {
                          unit.max_z
                        }{" "}
                        m
                      </span>
                    </div>

                    {owner && (
                      <div
                        style={
                          styles.ownerPreview
                        }
                      >
                        <span>
                          OWNER
                        </span>

                        <strong>
                          {
                            owner.name
                          }
                        </strong>
                      </div>
                    )}
                  </button>
                );
              }
            )}
          </div>
        )}
      </section>

      {/* SELECTED PROPERTY */}

      {selectedUnit && (
        <section
          style={
            styles.propertyPanel
          }
        >
          <div
            style={
              styles.propertyHeader
            }
          >
            <div>
              <div
                style={
                  styles.propertyEyebrow
                }
              >
                PROPERTY RECORD
              </div>

              <h2
                style={
                  styles.propertyTitle
                }
              >
                Apartment{" "}
                {
                  selectedUnit.unit_number
                }
              </h2>

              <div
                style={
                  styles.propertyVpid
                }
              >
                {
                  selectedUnit.vertical_property_id
                }
              </div>
            </div>

            <div
              style={{
                ...styles.largeStatusBadge,

                ...(getRegistryStatus(
                  selectedUnit
                ) ===
                  "REGISTERED"
                  ? styles.statusRegistered
                  : styles.statusUnregistered),
              }}
            >
              ●{" "}
              {getRegistryStatus(
                selectedUnit
              )}
            </div>
          </div>

          <div
            style={
              styles.propertyGrid
            }
          >
            <InfoBox
              label="UNIT"
              value={
                selectedUnit.unit_number
              }
            />

            <InfoBox
              label="FLOOR"
              value={
                selectedUnit.floor_label
              }
            />

            <InfoBox
              label="AREA"
              value={`${selectedUnit.area_sq_m} m²`}
            />

            <InfoBox
              label="VERTICAL RANGE"
              value={`${selectedUnit.min_z} – ${selectedUnit.max_z} m`}
            />

            <InfoBox
              label="PARENT ULPIN"
              value={
                selectedUnit.parent_ulpin
              }
            />

            <InfoBox
              label="VPID"
              value={
                selectedUnit.vertical_property_id
              }
            />
          </div>

          {/* UNREGISTERED */}

          {getRegistryStatus(
            selectedUnit
          ) ===
            "UNREGISTERED" && (
              <div
                style={
                  styles.registrationBox
                }
              >
                <div
                  style={
                    styles.registrationIcon
                  }
                >
                  📜
                </div>

                <div
                  style={
                    styles.registrationContent
                  }
                >
                  <h3
                    style={
                      styles.registrationTitle
                    }
                  >
                    Property not registered
                  </h3>

                  <p
                    style={
                      styles.registrationText
                    }
                  >
                    This apartment exists
                    in the 3D cadastral
                    model but does not
                    yet have a registered
                    owner.
                  </p>
                </div>

                <button
                  type="button"
                  style={
                    styles.primaryButton
                  }
                  onClick={
                    openRegistrationForm
                  }
                >
                  REGISTER PROPERTY →
                </button>
              </div>
            )}

          {/* REGISTERED */}

          {getRegistryStatus(
            selectedUnit
          ) ===
            "REGISTERED" &&
            propertyOwners[
            selectedUnit.id
            ] && (
              <div
                style={
                  styles.registrationBox
                }
              >
                <div
                  style={
                    styles.registrationIcon
                  }
                >
                  👤
                </div>

                <div
                  style={
                    styles.registrationContent
                  }
                >
                  <h3
                    style={
                      styles.registrationTitle
                    }
                  >
                    {
                      propertyOwners[
                        selectedUnit.id
                      ].name
                    }
                  </h3>

                  <p
                    style={
                      styles.registrationText
                    }
                  >
                    Current owner •{" "}
                    {
                      propertyOwners[
                        selectedUnit.id
                      ].ownership_percentage
                    }
                    % ownership
                    {propertyOwners[
                      selectedUnit.id
                    ].contact &&
                      ` • ${propertyOwners[
                        selectedUnit.id
                      ].contact}`}
                  </p>
                </div>

                <div
                  style={
                    styles.ownerActions
                  }
                >
                  <button
                    type="button"
                    style={
                      styles.secondaryButton
                    }
                    onClick={
                      openTransferForm
                    }
                  >
                    TRANSFER OWNERSHIP →
                  </button>

                  <button
                    type="button"
                    style={
                      styles.historyButton
                    }
                    onClick={
                      loadOwnershipHistory
                    }
                    disabled={
                      isLoadingHistory
                    }
                  >
                    {isLoadingHistory
                      ? "LOADING..."
                      : "VIEW HISTORY"}
                  </button>
                </div>
              </div>
            )}

          {ownershipHistory.length > 0 && (
            <div
              style={
                styles.historyPanel
              }
            >
              <div
                style={
                  styles.historyHeader
                }
              >
                <div>
                  <div
                    style={
                      styles.historyEyebrow
                    }
                  >
                    OWNERSHIP RECORD
                  </div>
                  <h3
                    style={
                      styles.historyTitle
                    }
                  >
                    Ownership History
                  </h3>
                </div>

                <span
                  style={
                    styles.historyCount
                  }
                >
                  {ownershipHistory.length} RECORDS
                </span>
              </div>

              <div
                style={
                  styles.historyTimeline
                }
              >
                {ownershipHistory
                  .slice()
                  .reverse()
                  .map(
                    (record, index) => (
                      <div
                        key={
                          record.id
                        }
                        style={
                          styles.historyItem
                        }
                      >
                        <div
                          style={
                            styles.historyMarkerColumn
                          }
                        >
                          <div
                            style={{
                              ...styles.historyMarker,
                              ...(record.is_current
                                ? styles.historyMarkerCurrent
                                : {}),
                            }}
                          >
                            {record.is_current
                              ? "✓"
                              : index + 1}
                          </div>

                          {index <
                            ownershipHistory.length - 1 && (
                            <div
                              style={
                                styles.historyLine
                              }
                            />
                          )}
                        </div>

                        <div
                          style={
                            styles.historyContent
                          }
                        >
                          <div
                            style={
                              styles.historyOwnerRow
                            }
                          >
                            <strong
                              style={
                                styles.historyOwnerName
                              }
                            >
                              {record.name}
                            </strong>

                            {record.is_current && (
                              <span
                                style={
                                  styles.currentOwnerBadge
                                }
                              >
                                CURRENT OWNER
                              </span>
                            )}
                          </div>

                          <div
                            style={
                              styles.historyMeta
                            }
                          >
                            <span>
                              {record.ownership_percentage}% ownership
                            </span>

                            {record.contact && (
                              <span>
                                {record.contact}
                              </span>
                            )}
                          </div>

                          <div
                            style={
                              styles.historyDates
                            }
                          >
                            <span>
                              {formatOwnershipDate(
                                record.valid_from
                              )}
                            </span>
                            <span>→</span>
                            <span>
                              {record.valid_to
                                ? formatOwnershipDate(
                                    record.valid_to
                                  )
                                : "Present"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  )}
              </div>
            </div>
          )}

          <div
            style={
              styles.futureFeatures
            }
          >
            <span>
              REGISTRY
            </span>

            <span>
              OWNERSHIP
            </span>

            <span>
              TRANSFER HISTORY
            </span>

            <span>
              TAX
            </span>

            <span>
              UTILITIES
            </span>

            <span>
              AUDIT
            </span>
          </div>
        </section>
      )}

      {/* REGISTRATION MODAL */}

      {showRegistrationForm &&
        selectedUnit && (
          <div
            style={
              styles.modalOverlay
            }
          >
            <div
              style={
                styles.modal
              }
            >
              <div
                style={
                  styles.modalHeader
                }
              >
                <div>
                  <div
                    style={
                      styles.modalEyebrow
                    }
                  >
                    PROPERTY REGISTRATION
                  </div>

                  <h2
                    style={
                      styles.modalTitle
                    }
                  >
                    Register Apartment{" "}
                    {
                      selectedUnit.unit_number
                    }
                  </h2>

                  <p
                    style={
                      styles.modalSubtitle
                    }
                  >
                    {
                      selectedUnit.vertical_property_id
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowRegistrationForm(
                      false
                    )
                  }
                  style={
                    styles.closeButton
                  }
                >
                  ×
                </button>
              </div>

              <div
                style={
                  styles.modalBody
                }
              >
                <div
                  style={
                    styles.modalInfo
                  }
                >
                  <div>
                    <span>
                      BUILDING
                    </span>

                    <strong>
                      {
                        selectedBuilding?.building_name ??
                        "-"
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      FLOOR
                    </span>

                    <strong>
                      {
                        selectedUnit.floor_label
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      AREA
                    </span>

                    <strong>
                      {
                        selectedUnit.area_sq_m
                      }{" "}
                      m²
                    </strong>
                  </div>
                </div>

                <label
                  style={
                    styles.formLabel
                  }
                >
                  Owner Full Name
                  <input
                    type="text"
                    value={
                      ownerName
                    }
                    onChange={(
                      event
                    ) =>
                      setOwnerName(
                        event.target.value
                      )
                    }
                    placeholder="Enter registered owner's full name"
                    style={
                      styles.formInput
                    }
                    autoFocus
                  />
                </label>

                <label
                  style={
                    styles.formLabel
                  }
                >
                  Contact Number
                  <input
                    type="text"
                    value={
                      ownerContact
                    }
                    onChange={(
                      event
                    ) =>
                      setOwnerContact(
                        event.target.value
                      )
                    }
                    placeholder="Enter phone number"
                    style={
                      styles.formInput
                    }
                  />
                </label>

                <div
                  style={
                    styles.formRow
                  }
                >
                  <label
                    style={
                      styles.formLabel
                    }
                  >
                    Ownership %
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={
                        ownershipPercentage
                      }
                      onChange={(
                        event
                      ) =>
                        setOwnershipPercentage(
                          event.target.value
                        )
                      }
                      style={
                        styles.formInput
                      }
                    />
                  </label>

                  <label
                    style={
                      styles.formLabel
                    }
                  >
                    Registration Date
                    <input
                      type="date"
                      value={
                        registrationDate
                      }
                      onChange={(
                        event
                      ) =>
                        setRegistrationDate(
                          event.target.value
                        )
                      }
                      style={
                        styles.formInput
                      }
                    />
                  </label>
                </div>

                <div
                  style={
                    styles.modalNotice
                  }
                >
                  <strong>
                    Official Registration
                  </strong>

                  <span>
                    This creates an owner
                    record and an active
                    property ownership
                    record. The VPID remains
                    unchanged.
                  </span>
                </div>
              </div>

              <div
                style={
                  styles.modalFooter
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setShowRegistrationForm(
                      false
                    )
                  }
                  style={
                    styles.cancelButton
                  }
                  disabled={
                    isRegistering
                  }
                >
                  CANCEL
                </button>

                <button
                  type="button"
                  onClick={
                    registerProperty
                  }
                  style={
                    styles.primaryButton
                  }
                  disabled={
                    isRegistering
                  }
                >
                  {isRegistering
                    ? "REGISTERING..."
                    : "CONFIRM REGISTRATION →"}
                </button>
              </div>
            </div>
          </div>


        )} 
      {/* TRANSFER OWNERSHIP MODAL */}

      {showTransferForm &&
        selectedUnit && (
          <div
            style={
              styles.modalOverlay
            }
          >
            <div
              style={
                styles.modal
              }
            >
              <div
                style={
                  styles.modalHeader
                }
              >
                <div>
                  <div
                    style={
                      styles.modalEyebrow
                    }
                  >
                    OWNERSHIP TRANSFER
                  </div>

                  <h2
                    style={
                      styles.modalTitle
                    }
                  >
                    Transfer Apartment{" "}
                    {
                      selectedUnit.unit_number
                    }
                  </h2>

                  <p
                    style={
                      styles.modalSubtitle
                    }
                  >
                    {
                      selectedUnit.vertical_property_id
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowTransferForm(false)
                  }
                  style={
                    styles.closeButton
                  }
                >
                  ×
                </button>
              </div>

              <div
                style={
                  styles.modalBody
                }
              >
                <div
                  style={
                    styles.currentOwnerBox
                  }
                >
                  <div
                    style={
                      styles.currentOwnerIcon
                    }
                  >
                    👤
                  </div>

                  <div>
                    <span
                      style={
                        styles.currentOwnerLabel
                      }
                    >
                      CURRENT OWNER
                    </span>

                    <strong
                      style={
                        styles.currentOwnerName
                      }
                    >
                      {
                        propertyOwners[
                          selectedUnit.id
                        ]?.name
                      }
                    </strong>

                    <span
                      style={
                        styles.currentOwnerContact
                      }
                    >
                      {
                        propertyOwners[
                          selectedUnit.id
                        ]?.contact ??
                        "No contact recorded"
                      }
                    </span>
                  </div>
                </div>

                <div
                  style={
                    styles.transferArrow
                  }
                >
                  ↓
                  <span>
                    NEW REGISTERED OWNER
                  </span>
                </div>

                <label
                  style={
                    styles.formLabel
                  }
                >
                  New Owner Full Name
                  <input
                    type="text"
                    value={
                      transferOwnerName
                    }
                    onChange={(event) =>
                      setTransferOwnerName(
                        event.target.value
                      )
                    }
                    placeholder="Enter new owner's full name"
                    style={
                      styles.formInput
                    }
                    autoFocus
                  />
                </label>

                <label
                  style={
                    styles.formLabel
                  }
                >
                  New Owner Contact
                  <input
                    type="text"
                    value={
                      transferOwnerContact
                    }
                    onChange={(event) =>
                      setTransferOwnerContact(
                        event.target.value
                      )
                    }
                    placeholder="Enter phone number"
                    style={
                      styles.formInput
                    }
                  />
                </label>

                <div
                  style={
                    styles.formRow
                  }
                >
                  <label
                    style={
                      styles.formLabel
                    }
                  >
                    Ownership %
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={
                        transferOwnershipPercentage
                      }
                      onChange={(event) =>
                        setTransferOwnershipPercentage(
                          event.target.value
                        )
                      }
                      style={
                        styles.formInput
                      }
                    />
                  </label>

                  <label
                    style={
                      styles.formLabel
                    }
                  >
                    Transfer Date
                    <input
                      type="date"
                      value={
                        transferDate
                      }
                      onChange={(event) =>
                        setTransferDate(
                          event.target.value
                        )
                      }
                      style={
                        styles.formInput
                      }
                    />
                  </label>
                </div>

                <div
                  style={
                    styles.transferNotice
                  }
                >
                  <strong>
                    Ownership history is preserved
                  </strong>

                  <span>
                    The previous owner's record
                    remains in the registry.
                    Only the active ownership
                    relationship changes. The
                    VPID remains unchanged.
                  </span>
                </div>
              </div>

              <div
                style={
                  styles.modalFooter
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setShowTransferForm(false)
                  }
                  style={
                    styles.cancelButton
                  }
                  disabled={
                    isTransferring
                  }
                >
                  CANCEL
                </button>

                <button
                  type="button"
                  onClick={
                    transferPropertyOwnership
                  }
                  style={
                    styles.primaryButton
                  }
                  disabled={
                    isTransferring
                  }
                >
                  {isTransferring
                    ? "TRANSFERRING..."
                    : "CONFIRM TRANSFER →"}
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  );
}

/*
|--------------------------------------------------------------------------
| INFO BOX
|--------------------------------------------------------------------------
*/

function formatOwnershipDate(
  value: string
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }
  ).format(date);
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={
        styles.infoBox
      }
    >
      <div
        style={
          styles.infoLabel
        }
      >
        {label}
      </div>

      <div
        style={
          styles.infoValue
        }
      >
        {value}
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| STYLES
|--------------------------------------------------------------------------
*/

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    minHeight: "100%",
    padding: "32px",
    background:
      "linear-gradient(135deg, #f4f7fb 0%, #eef2f7 100%)",
    color: "#172033",
    boxSizing: "border-box",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "24px",
    marginBottom: "28px",
  },

  eyebrow: {
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "1.5px",
    color: "#2563eb",
    marginBottom: "8px",
  },

  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 800,
    letterSpacing:
      "-0.5px",
  },

  subtitle: {
    margin:
      "8px 0 0 0",
    color: "#64748b",
    fontSize: "13px",
    maxWidth:
      "680px",
  },

  headerStats: {
    display: "flex",
    gap: "10px",
  },

  statCard: {
    minWidth: "85px",
    padding:
      "14px 16px",
    background:
      "#ffffff",
    border:
      "1px solid #dbe2ea",
    borderRadius:
      "12px",
    textAlign:
      "center",
    boxShadow:
      "0 8px 20px rgba(15,23,42,0.05)",
  },

  statValue: {
    display: "block",
    fontSize: "22px",
    fontWeight: 900,
    color: "#2563eb",
  },

  statLabel: {
    display: "block",
    marginTop: "3px",
    fontSize: "9px",
    fontWeight: 800,
    color: "#64748b",
    letterSpacing:
      "0.6px",
    textTransform:
      "uppercase",
  },

  error: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    padding:
      "13px 16px",
    marginBottom: "16px",
    borderRadius: "11px",
    background:
      "#fef2f2",
    border:
      "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: "12px",
  },

  success: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    padding:
      "13px 16px",
    marginBottom: "16px",
    borderRadius: "11px",
    background:
      "#ecfdf5",
    border:
      "1px solid #a7f3d0",
    color: "#047857",
    fontSize: "12px",
  },

  section: {
    marginBottom: "24px",
    padding: "22px",
    background:
      "#ffffff",
    border:
      "1px solid #dbe2ea",
    borderRadius:
      "18px",
    boxShadow:
      "0 10px 28px rgba(15,23,42,0.05)",
  },

  sectionHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "20px",
    marginBottom:
      "20px",
  },

  sectionNumber: {
    display:
      "inline-flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    width: "34px",
    height: "34px",
    marginBottom:
      "10px",
    borderRadius:
      "10px",
    background:
      "#eff6ff",
    color:
      "#2563eb",
    fontSize: "11px",
    fontWeight: 900,
  },

  sectionTitle: {
    margin: 0,
    fontSize: "19px",
    fontWeight: 800,
  },

  sectionSubtitle: {
    margin:
      "5px 0 0 0",
    color:
      "#64748b",
    fontSize: "12px",
  },

  buildingGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "12px",
  },

  buildingCard: {
    display: "flex",
    alignItems:
      "center",
    gap: "12px",
    padding: "15px",
    textAlign: "left",
    border:
      "1px solid #dbe2ea",
    borderRadius:
      "13px",
    background:
      "#f8fafc",
    cursor: "pointer",
  },

  buildingCardActive: {
    border:
      "2px solid #2563eb",
    background:
      "#eff6ff",
  },

  buildingIcon: {
    fontSize: "25px",
  },

  buildingInfo: {
    display: "flex",
    flexDirection:
      "column",
    gap: "4px",
    flex: 1,
  },

  buildingInfoStrong: {},

  buildingArrow: {
    fontSize: "18px",
    color: "#2563eb",
    fontWeight: 900,
  },

  summaryCard: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: "20px",
    marginBottom:
      "24px",
    padding:
      "20px 22px",
    borderRadius:
      "16px",
    background:
      "#172033",
    color:
      "#ffffff",
  },

  summaryEyebrow: {
    fontSize: "9px",
    fontWeight: 900,
    letterSpacing:
      "1.2px",
    opacity: 0.65,
  },

  summaryTitle: {
    margin:
      "5px 0 0 0",
    fontSize: "21px",
  },

  summaryStats: {
    display: "flex",
    gap: "25px",
  },

  summaryStatsItem: {},

  filterActions: {
    display: "flex",
    gap: "8px",
  },

  searchInput: {
    width: "240px",
    padding:
      "10px 12px",
    border:
      "1px solid #cbd5e1",
    borderRadius: "9px",
    outline: "none",
    fontSize: "12px",
  },

  clearButton: {
    padding:
      "10px 13px",
    border:
      "1px solid #cbd5e1",
    borderRadius: "9px",
    background:
      "#ffffff",
    cursor:
      "pointer",
    fontWeight: 700,
  },

  floorFilters: {
    display: "flex",
    flexWrap:
      "wrap",
    gap: "7px",
    marginBottom:
      "18px",
  },

  floorButton: {
    padding:
      "8px 13px",
    border:
      "1px solid #cbd5e1",
    borderRadius:
      "8px",
    background:
      "#ffffff",
    color:
      "#475569",
    fontSize: "10px",
    fontWeight: 900,
    cursor:
      "pointer",
  },

  floorButtonActive: {
    background:
      "#2563eb",
    borderColor:
      "#2563eb",
    color:
      "#ffffff",
  },

  unitGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fill, minmax(245px, 1fr))",
    gap: "11px",
  },

  unitCard: {
    padding:
      "15px",
    textAlign:
      "left",
    border:
      "1px solid #dbe2ea",
    borderRadius:
      "13px",
    background:
      "#ffffff",
    cursor:
      "pointer",
  },

  unitCardActive: {
    border:
      "2px solid #2563eb",
    background:
      "#f8fbff",
  },

  unitCardTop: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
  },

  unitNumber: {
    fontSize: "20px",
    fontWeight: 900,
  },

  statusBadge: {
    padding:
      "4px 7px",
    borderRadius:
      "999px",
    fontSize: "8px",
    fontWeight: 900,
    letterSpacing:
      "0.4px",
  },

  statusRegistered: {
    background:
      "#dcfce7",
    color:
      "#15803d",
  },

  statusUnregistered: {
    background:
      "#fef3c7",
    color:
      "#92400e",
  },

  unitFloor: {
    marginTop:
      "6px",
    fontSize: "11px",
    fontWeight: 800,
    color:
      "#2563eb",
  },

  unitVpid: {
    marginTop:
      "7px",
    fontSize: "9px",
    color:
      "#64748b",
    wordBreak:
      "break-all",
  },

  unitDetails: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "10px",
    marginTop:
      "12px",
    paddingTop:
      "10px",
    borderTop:
      "1px solid #edf1f5",
    fontSize: "10px",
    color:
      "#64748b",
  },

  ownerPreview: {
    display: "flex",
    flexDirection:
      "column",
    gap: "3px",
    marginTop:
      "10px",
    paddingTop:
      "9px",
    borderTop:
      "1px solid #edf1f5",
    fontSize: "9px",
  },

  propertyPanel: {
    padding: "24px",
    borderRadius:
      "18px",
    background:
      "#172033",
    color:
      "#ffffff",
    boxShadow:
      "0 18px 45px rgba(15,23,42,0.16)",
  },

  propertyHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "20px",
    marginBottom:
      "20px",
  },

  propertyEyebrow: {
    fontSize: "9px",
    fontWeight: 900,
    letterSpacing:
      "1.3px",
    color:
      "#93c5fd",
  },

  propertyTitle: {
    margin:
      "5px 0",
    fontSize: "24px",
  },

  propertyVpid: {
    fontSize: "10px",
    color:
      "#94a3b8",
    wordBreak:
      "break-all",
  },

  largeStatusBadge: {
    padding:
      "9px 12px",
    borderRadius:
      "999px",
    fontSize: "10px",
    fontWeight: 900,
  },

  propertyGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "9px",
  },

  infoBox: {
    padding:
      "12px",
    border:
      "1px solid rgba(255,255,255,0.09)",
    borderRadius:
      "10px",
    background:
      "rgba(255,255,255,0.035)",
  },

  infoLabel: {
    fontSize: "8px",
    fontWeight: 900,
    letterSpacing:
      "0.8px",
    color:
      "#94a3b8",
  },

  infoValue: {
    marginTop:
      "5px",
    fontSize: "11px",
    fontWeight: 700,
    wordBreak:
      "break-word",
  },

  registrationBox: {
    display: "flex",
    alignItems:
      "center",
    gap: "14px",
    marginTop:
      "20px",
    padding:
      "16px",
    border:
      "1px solid rgba(255,255,255,0.10)",
    borderRadius:
      "13px",
    background:
      "rgba(255,255,255,0.04)",
  },

  registrationIcon: {
    width: "40px",
    height: "40px",
    display: "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    borderRadius:
      "10px",
    background:
      "rgba(255,255,255,0.08)",
    fontSize: "19px",
  },

  registrationContent: {
    flex: 1,
  },

  registrationTitle: {
    margin:
      "0 0 5px 0",
    fontSize: "14px",
  },

  registrationText: {
    margin: 0,
    color:
      "#94a3b8",
    fontSize: "11px",
    lineHeight: 1.55,
  },

  primaryButton: {
    padding:
      "12px 16px",
    border: "none",
    borderRadius: "9px",
    background:
      "#2563eb",
    color:
      "#ffffff",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing:
      "0.4px",
    cursor:
      "pointer",
    whiteSpace:
      "nowrap",
  },

  secondaryButton: {
    padding:
      "12px 16px",
    border:
      "1px solid #475569",
    borderRadius:
      "9px",
    background:
      "#1e293b",
    color:
      "#ffffff",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing:
      "0.4px",
    cursor:
      "pointer",
    whiteSpace:
      "nowrap",
  },

  ownerActions: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    flexShrink: 0,
  },

  historyButton: {
    padding: "9px 12px",
    border: "1px solid #475569",
    borderRadius: "9px",
    background: "transparent",
    color: "#cbd5e1",
    fontSize: "9px",
    fontWeight: 900,
    letterSpacing: "0.4px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  historyPanel: {
    marginTop: "18px",
    padding: "18px",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.035)",
  },

  historyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "15px",
  },

  historyEyebrow: {
    fontSize: "8px",
    fontWeight: 900,
    letterSpacing: "1.1px",
    color: "#93c5fd",
  },

  historyTitle: {
    margin: "4px 0 0 0",
    fontSize: "15px",
  },

  historyCount: {
    padding: "5px 8px",
    borderRadius: "999px",
    background: "rgba(37,99,235,0.16)",
    color: "#93c5fd",
    fontSize: "8px",
    fontWeight: 900,
  },

  historyTimeline: {
    display: "flex",
    flexDirection: "column",
  },

  historyItem: {
    display: "flex",
    gap: "12px",
  },

  historyMarkerColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "25px",
    flexShrink: 0,
  },

  historyMarker: {
    width: "23px",
    height: "23px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "#334155",
    color: "#cbd5e1",
    fontSize: "8px",
    fontWeight: 900,
  },

  historyMarkerCurrent: {
    background: "#16a34a",
    color: "#ffffff",
  },

  historyLine: {
    width: "1px",
    flex: 1,
    minHeight: "32px",
    background: "rgba(148,163,184,0.25)",
  },

  historyContent: {
    flex: 1,
    paddingBottom: "18px",
  },

  historyOwnerRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },

  historyOwnerName: {
    fontSize: "12px",
  },

  currentOwnerBadge: {
    padding: "3px 6px",
    borderRadius: "999px",
    background: "rgba(34,197,94,0.15)",
    color: "#86efac",
    fontSize: "7px",
    fontWeight: 900,
  },

  historyMeta: {
    display: "flex",
    gap: "12px",
    marginTop: "4px",
    color: "#94a3b8",
    fontSize: "9px",
  },

  historyDates: {
    display: "flex",
    gap: "7px",
    marginTop: "7px",
    color: "#cbd5e1",
    fontSize: "9px",
    fontWeight: 700,
  },

  currentOwnerBox: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px",
    marginBottom: "12px",
    borderRadius: "11px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },

  currentOwnerIcon: {
    width: "38px",
    height: "38px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    background: "#eff6ff",
    fontSize: "18px",
  },

  currentOwnerLabel: {
    display: "block",
    fontSize: "8px",
    fontWeight: 900,
    color: "#64748b",
  },

  currentOwnerName: {
    display: "block",
    marginTop: "3px",
    fontSize: "13px",
    color: "#172033",
  },

  currentOwnerContact: {
    display: "block",
    marginTop: "2px",
    fontSize: "9px",
    color: "#64748b",
  },

  transferArrow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    margin: "2px 0 12px",
    color: "#2563eb",
    fontSize: "20px",
    fontWeight: 900,
  },

  transferNotice: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    marginTop: "4px",
    padding: "12px",
    borderRadius: "9px",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontSize: "10px",
    lineHeight: 1.5,
  },

  futureFeatures: {
    display: "flex",
    flexWrap:
      "wrap",
    gap: "8px",
    marginTop:
      "18px",
    paddingTop:
      "16px",
    borderTop:
      "1px solid rgba(255,255,255,0.08)",
  },

  loadingCard: {
    maxWidth:
      "500px",
    margin:
      "100px auto",
    padding:
      "40px",
    textAlign:
      "center",
    borderRadius:
      "20px",
    background:
      "#ffffff",
    border:
      "1px solid #dbe2ea",
    boxShadow:
      "0 15px 40px rgba(15,23,42,0.08)",
  },

  loadingIcon: {
    fontSize: "40px",
    color:
      "#2563eb",
  },

  loadingTitle: {
    margin:
      "16px 0 6px 0",
    fontSize: "20px",
  },

  loadingText: {
    margin: 0,
    fontSize: "13px",
    color:
      "#64748b",
  },

  unitsLoading: {
    padding:
      "50px",
    textAlign:
      "center",
    color:
      "#64748b",
    fontSize: "13px",
  },

  spinner: {
    marginBottom:
      "10px",
    fontSize: "28px",
    color:
      "#2563eb",
  },

  emptyState: {
    padding:
      "55px 20px",
    textAlign:
      "center",
    borderRadius:
      "13px",
    background:
      "#f8fafc",
    border:
      "1px dashed #cbd5e1",
  },

  emptyIcon: {
    fontSize: "35px",
  },

  emptyTitle: {
    margin:
      "12px 0 5px 0",
    fontSize: "16px",
  },

  emptyText: {
    margin: 0,
    color:
      "#64748b",
    fontSize: "12px",
  },

  modalOverlay: {
    position:
      "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    padding: "20px",
    background:
      "rgba(15,23,42,0.62)",
    backdropFilter:
      "blur(5px)",
  },

  modal: {
    width:
      "min(650px, 100%)",
    maxHeight:
      "90vh",
    overflowY:
      "auto",
    borderRadius:
      "18px",
    background:
      "#ffffff",
    color:
      "#172033",
    boxShadow:
      "0 25px 70px rgba(0,0,0,0.25)",
  },

  modalHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "20px",
    padding:
      "22px",
    borderBottom:
      "1px solid #e2e8f0",
  },

  modalEyebrow: {
    fontSize: "9px",
    fontWeight: 900,
    letterSpacing:
      "1.2px",
    color:
      "#2563eb",
  },

  modalTitle: {
    margin:
      "6px 0 4px 0",
    fontSize: "21px",
  },

  modalSubtitle: {
    margin: 0,
    fontSize: "10px",
    color:
      "#64748b",
    wordBreak:
      "break-all",
  },

  closeButton: {
    width: "34px",
    height: "34px",
    border: "none",
    borderRadius:
      "8px",
    background:
      "#f1f5f9",
    color:
      "#475569",
    fontSize: "22px",
    cursor:
      "pointer",
  },

  modalBody: {
    padding:
      "22px",
  },

  modalInfo: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, 1fr)",
    gap: "10px",
    marginBottom:
      "20px",
  },

  formLabel: {
    display: "flex",
    flexDirection:
      "column",
    gap: "7px",
    marginBottom:
      "15px",
    fontSize: "10px",
    fontWeight: 900,
    color:
      "#334155",
    letterSpacing:
      "0.3px",
  },

  formInput: {
    width: "100%",
    boxSizing:
      "border-box",
    padding:
      "11px 12px",
    border:
      "1px solid #cbd5e1",
    borderRadius:
      "9px",
    outline: "none",
    fontSize: "12px",
    color:
      "#172033",
    background:
      "#ffffff",
  },

  formRow: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: "12px",
  },

  modalNotice: {
    display: "flex",
    flexDirection:
      "column",
    gap: "5px",
    marginTop:
      "4px",
    padding:
      "12px",
    borderRadius:
      "9px",
    background:
      "#eff6ff",
    border:
      "1px solid #bfdbfe",
    color:
      "#1e40af",
    fontSize: "10px",
    lineHeight: 1.5,
  },

  modalFooter: {
    display: "flex",
    justifyContent:
      "flex-end",
    gap: "10px",
    padding:
      "16px 22px",
    borderTop:
      "1px solid #e2e8f0",
  },

  cancelButton: {
    padding:
      "12px 16px",
    border:
      "1px solid #cbd5e1",
    borderRadius:
      "9px",
    background:
      "#ffffff",
    color:
      "#475569",
    fontSize: "10px",
    fontWeight: 900,
    cursor:
      "pointer",
  },
};

export default EditExistingBuilding;
