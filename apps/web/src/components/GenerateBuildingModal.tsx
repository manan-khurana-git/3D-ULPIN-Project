import { useEffect, useState } from "react";
import { getAuthToken } from "../services/authService";

type Parcel = {
  id: string;
  ulpin: string;
  parcel_number: string | null;
  area_sq_m: string | number | null;
  base_elevation_m: string | number | null;
};

type GenerateBuildingModalProps = {
  open: boolean;
  parcels: Parcel[];
  selectedParcel: Parcel | null;
  onClose: () => void;
  onGenerated: (buildingId: string) => void;
};

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://threed-ulpin-api.onrender.com/api";

const STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
];

function GenerateBuildingModal({
  open,
  parcels,
  selectedParcel,
  onClose,
  onGenerated,
}: GenerateBuildingModalProps) {
  const [parcelId, setParcelId] = useState("");

  const [buildingName, setBuildingName] =
    useState("New Building");

  const [country] = useState("India");

  const [state, setState] =
    useState("");

  const [district, setDistrict] =
    useState("");

  const [city, setCity] =
    useState("");

  const [area, setArea] =
    useState("");

  const [street, setStreet] =
    useState("");

  const [pincode, setPincode] =
    useState("");

  const [addressLine, setAddressLine] =
    useState("");

  const [floors, setFloors] =
    useState("4");

  const [floorHeight, setFloorHeight] =
    useState("3");

  const [baseElevation, setBaseElevation] =
    useState("215");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");

    if (selectedParcel) {
      setParcelId(selectedParcel.id);

      setBaseElevation(
        String(
          selectedParcel.base_elevation_m ?? 0
        )
      );
    } else if (parcels.length > 0) {
      setParcelId(parcels[0].id);

      setBaseElevation(
        String(
          parcels[0].base_elevation_m ?? 0
        )
      );
    }
  }, [open, selectedParcel, parcels]);

  if (!open) {
    return null;
  }

  const handleParcelChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const id = event.target.value;

    setParcelId(id);

    const parcel = parcels.find(
      (item) => item.id === id
    );

    if (parcel) {
      setBaseElevation(
        String(
          parcel.base_elevation_m ?? 0
        )
      );
    }
  };

  const handlePincodeChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value =
      event.target.value.replace(/\D/g, "");

    setPincode(value.slice(0, 6));
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");

    if (!parcelId) {
      setError(
        "Please select a parent parcel."
      );
      return;
    }

    if (!state) {
      setError(
        "Please select a state."
      );
      return;
    }

    if (!district.trim()) {
      setError(
        "Please enter the district."
      );
      return;
    }

    if (!city.trim()) {
      setError(
        "Please enter the city."
      );
      return;
    }

    if (!area.trim()) {
      setError(
        "Please enter the area."
      );
      return;
    }

    if (!street.trim()) {
      setError(
        "Please enter the street."
      );
      return;
    }

    if (!/^\d{6}$/.test(pincode)) {
      setError(
        "Pincode must be exactly 6 digits."
      );
      return;
    }

    if (!addressLine.trim()) {
      setError(
        "Please enter the complete address."
      );
      return;
    }

    const numberOfFloors =
      Number(floors);

    const height =
      Number(floorHeight);

    const elevation =
      Number(baseElevation);

    if (
      !Number.isInteger(numberOfFloors) ||
      numberOfFloors < 1 ||
      numberOfFloors > 100
    ) {
      setError(
        "Floors must be an integer between 1 and 100."
      );
      return;
    }

    if (
      !Number.isFinite(height) ||
      height <= 0
    ) {
      setError(
        "Floor height must be greater than 0."
      );
      return;
    }

    if (!Number.isFinite(elevation)) {
      setError(
        "Base elevation must be a valid number."
      );
      return;
    }

    const token = getAuthToken();

    if (!token) {
      setError(
        "Your session has expired. Please log in again."
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(
        `${API_URL}/buildings/generate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            parcel_id: parcelId,

            building_name:
              buildingName.trim() ||
              "New Building",

            country,

            state:
              state.trim(),

            district:
              district.trim(),

            city:
              city.trim(),

            area:
              area.trim(),

            street:
              street.trim(),

            pincode,

            address_line:
              addressLine.trim(),

            floors:
              numberOfFloors,

            floor_height_m:
              height,

            base_elevation_m:
              elevation,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.detail ||
            `Building generation failed (${response.status})`
        );
      }

      if (!data.building?.id) {
        throw new Error(
          "Building was generated but no building ID was returned."
        );
      }

      onGenerated(
        data.building.id
      );
    } catch (generationError) {
      console.error(
        "Building generation error:",
        generationError
      );

      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate building."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="generate-modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="generate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-building-title"
      >
        <div className="generate-modal-header">
          <div>
            <div className="generate-modal-kicker">
              3D CADASTRAL
            </div>

            <h2 id="generate-building-title">
              Generate New Building
            </h2>

            <p>
              Create a vertical 3D building
              structure from a mapped parcel.
            </p>
          </div>

          <button
            type="button"
            className="generate-modal-close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          className="generate-building-form"
          onSubmit={handleSubmit}
        >
          {/* PARENT PARCEL */}

          <div className="generate-form-field full">
            <label htmlFor="generate-parcel">
              Parent Parcel
            </label>

            <select
              id="generate-parcel"
              value={parcelId}
              onChange={handleParcelChange}
              disabled={
                isSubmitting ||
                parcels.length === 0
              }
            >
              {parcels.length === 0 ? (
                <option value="">
                  No parcels available
                </option>
              ) : (
                parcels.map((parcel) => (
                  <option
                    key={parcel.id}
                    value={parcel.id}
                  >
                    {parcel.ulpin}
                    {parcel.parcel_number
                      ? ` — Parcel ${parcel.parcel_number}`
                      : ""}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* ADDRESS SECTION */}

          <div className="generate-form-section">
            <div className="generate-form-section-title">
              Property Location
            </div>

            <div className="generate-form-grid">
              {/* COUNTRY */}

              <div className="generate-form-field">
                <label htmlFor="building-country">
                  Country
                </label>

                <input
                  id="building-country"
                  type="text"
                  value={country}
                  disabled
                  readOnly
                />
              </div>

              {/* STATE */}

              <div className="generate-form-field">
                <label htmlFor="building-state">
                  State
                </label>

                <select
                  id="building-state"
                  value={state}
                  onChange={(event) =>
                    setState(
                      event.target.value
                    )
                  }
                  disabled={isSubmitting}
                >
                  <option value="">
                    Select State
                  </option>

                  {STATES.map(
                    (stateName) => (
                      <option
                        key={stateName}
                        value={stateName}
                      >
                        {stateName}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="generate-form-grid">
              {/* DISTRICT */}

              <div className="generate-form-field">
                <label htmlFor="building-district">
                  District
                </label>

                <input
                  id="building-district"
                  type="text"
                  value={district}
                  onChange={(event) =>
                    setDistrict(
                      event.target.value
                    )
                  }
                  placeholder="e.g. Gurugram"
                  disabled={isSubmitting}
                  maxLength={100}
                />
              </div>

              {/* CITY */}

              <div className="generate-form-field">
                <label htmlFor="building-city">
                  City
                </label>

                <input
                  id="building-city"
                  type="text"
                  value={city}
                  onChange={(event) =>
                    setCity(
                      event.target.value
                    )
                  }
                  placeholder="e.g. Gurugram"
                  disabled={isSubmitting}
                  maxLength={100}
                />
              </div>
            </div>

            <div className="generate-form-grid">
              {/* AREA */}

              <div className="generate-form-field">
                <label htmlFor="building-area">
                  Area / Locality
                </label>

                <input
                  id="building-area"
                  type="text"
                  value={area}
                  onChange={(event) =>
                    setArea(
                      event.target.value
                    )
                  }
                  placeholder="e.g. Sector 14"
                  disabled={isSubmitting}
                  maxLength={150}
                />
              </div>

              {/* STREET */}

              <div className="generate-form-field">
                <label htmlFor="building-street">
                  Street / Road
                </label>

                <input
                  id="building-street"
                  type="text"
                  value={street}
                  onChange={(event) =>
                    setStreet(
                      event.target.value
                    )
                  }
                  placeholder="e.g. MG Road"
                  disabled={isSubmitting}
                  maxLength={200}
                />
              </div>
            </div>

            <div className="generate-form-grid">
              {/* PINCODE */}

              <div className="generate-form-field">
                <label htmlFor="building-pincode">
                  Pincode
                </label>

                <input
                  id="building-pincode"
                  type="text"
                  inputMode="numeric"
                  value={pincode}
                  onChange={
                    handlePincodeChange
                  }
                  placeholder="e.g. 122001"
                  disabled={isSubmitting}
                  maxLength={6}
                />
              </div>

              <div className="generate-form-field">
                <label htmlFor="building-address">
                  Address
                </label>

                <input
                  id="building-address"
                  type="text"
                  value={addressLine}
                  onChange={(event) =>
                    setAddressLine(
                      event.target.value
                    )
                  }
                  placeholder="House / building address"
                  disabled={isSubmitting}
                  maxLength={300}
                />
              </div>
            </div>
          </div>

          {/* BUILDING DETAILS */}

          <div className="generate-form-section">
            <div className="generate-form-section-title">
              Building Details
            </div>

            <div className="generate-form-field full">
              <label htmlFor="building-name">
                Building Name
              </label>

              <input
                id="building-name"
                type="text"
                value={buildingName}
                onChange={(event) =>
                  setBuildingName(
                    event.target.value
                  )
                }
                placeholder="e.g. Demo Tower A"
                disabled={isSubmitting}
                maxLength={100}
              />
            </div>

            <div className="generate-form-grid">
              {/* FLOORS */}

              <div className="generate-form-field">
                <label htmlFor="building-floors">
                  Number of Floors
                </label>

                <input
                  id="building-floors"
                  type="number"
                  min="1"
                  max="100"
                  value={floors}
                  onChange={(event) =>
                    setFloors(
                      event.target.value
                    )
                  }
                  disabled={isSubmitting}
                />
              </div>

              {/* FLOOR HEIGHT */}

              <div className="generate-form-field">
                <label htmlFor="floor-height">
                  Floor Height (m)
                </label>

                <input
                  id="floor-height"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={floorHeight}
                  onChange={(event) =>
                    setFloorHeight(
                      event.target.value
                    )
                  }
                  disabled={isSubmitting}
                />
              </div>

              {/* BASE ELEVATION */}

              <div className="generate-form-field">
                <label htmlFor="base-elevation">
                  Base Elevation (m)
                </label>

                <input
                  id="base-elevation"
                  type="number"
                  step="0.1"
                  value={baseElevation}
                  onChange={(event) =>
                    setBaseElevation(
                      event.target.value
                    )
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* ERROR */}

          {error && (
            <div className="generate-form-error">
              {error}
            </div>
          )}

          {/* SUMMARY */}

          <div className="generate-form-summary">
            <div>
              <span>Floors</span>

              <strong>
                {Number(floors) || 0}
              </strong>
            </div>

            <div>
              <span>Height / Floor</span>

              <strong>
                {Number(floorHeight) || 0} m
              </strong>
            </div>

            <div>
              <span>Total Height</span>

              <strong>
                {(
                  (Number(floors) || 0) *
                  (Number(floorHeight) || 0)
                ).toFixed(1)}{" "}
                m
              </strong>
            </div>
          </div>

          {/* ACTIONS */}

          <div className="generate-form-actions">
            <button
              type="button"
              className="generate-cancel-button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="generate-submit-button"
              disabled={
                isSubmitting ||
                parcels.length === 0
              }
            >
              {isSubmitting
                ? "Generating..."
                : "🏗️ Generate 3D Building"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GenerateBuildingModal;