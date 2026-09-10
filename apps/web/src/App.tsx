import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import GenerateBuildingModal from "./components/GenerateBuildingModal";

import {
  Viewer,
  OpenStreetMapImageryProvider,
  ImageryLayer,
  Cartesian3,
  Cartesian2,
  BoundingSphere,
  Color,
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  LabelStyle,
  VerticalOrigin,
} from "cesium";

import {
  getAuthToken,
  getAuthUser,
  clearAuthData,
  type AuthUser,
} from "./services/authService.ts";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "./App.css";

const API_URL = "http://localhost:5000/api";

async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
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
}

/* =========================================================
   TYPES
========================================================= */

type ParcelGeometry = {
  type: "Polygon";
  coordinates: number[][][];
};

type Parcel = {
  id: string;
  ulpin: string;
  parcel_number: string | null;
  area_sq_m: string | number | null;
  base_elevation_m: string | number | null;
  geometry: ParcelGeometry | null;
  created_at: string;
};

type Building = {
  id: string;
  parcel_id: string;
  building_name: string;
  floor_height_m: string | number;
  base_elevation_m: string | number;
  floors: number;
  ulpin: string;
  parcel_number: string | null;
  created_at?: string;
};

type Floor = {
  id: string;
  building_id: string;
  floor_number: number;
  floor_label: string;
  min_z: string | number;
  max_z: string | number;
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

type Building3DResponse = {
  status: string;
  building: Building;
  floors: Floor[];
  property_units: PropertyUnit[];
};

type PropertyDetails = {
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

  owner: {
    name: string;
    ownership_percentage: number;
  } | null;

  tax: {
    assessment_year: number;
    assessed_value: number;
    tax_amount: number;
    payment_status: string;
  } | null;

  utilities: {
    status: string;
    provider: string;
    utility_type: string;
    connection_number: string;
  }[];
};

/* =========================================================
   CONSTANTS
========================================================= */

const EXPLOSION_DISTANCE = 18;

/* =========================================================
   HELPERS
========================================================= */

function calculateBoundingSphere(
  positions: Cartesian3[]
): BoundingSphere {
  if (positions.length === 0) {
    return new BoundingSphere(
      Cartesian3.ZERO,
      1000
    );
  }

  return BoundingSphere.fromPoints(
    positions
  );
}

function getParcelPositions(
  parcel: Parcel,
  fallbackHeight = 0
): Cartesian3[] {
  if (!parcel.geometry) {
    return [];
  }

  const coordinates =
    parcel.geometry.coordinates[0];

  if (
    !coordinates ||
    coordinates.length < 3
  ) {
    return [];
  }

  return coordinates.map(
    (coordinate) => {
      const longitude =
        Number(coordinate[0]);

      const latitude =
        Number(coordinate[1]);

      const rawHeight =
        coordinate.length >= 3
          ? Number(coordinate[2])
          : Number(
            parcel.base_elevation_m ??
            fallbackHeight
          );

      const height =
        Number.isFinite(rawHeight)
          ? rawHeight
          : fallbackHeight;

      return Cartesian3.fromDegrees(
        longitude,
        latitude,
        height
      );
    }
  );
}

function getParcelBounds(
  parcel: Parcel | null
) {
  if (!parcel?.geometry) {
    return null;
  }

  const coordinates =
    parcel.geometry.coordinates[0];

  if (
    !coordinates ||
    coordinates.length === 0
  ) {
    return null;
  }

  const longitudes =
    coordinates.map((point) =>
      Number(point[0])
    );

  const latitudes =
    coordinates.map((point) =>
      Number(point[1])
    );

  if (
    longitudes.some(
      (value) =>
        !Number.isFinite(value)
    ) ||
    latitudes.some(
      (value) =>
        !Number.isFinite(value)
    )
  ) {
    return null;
  }

  const minLon =
    Math.min(...longitudes);

  const maxLon =
    Math.max(...longitudes);

  const minLat =
    Math.min(...latitudes);

  const maxLat =
    Math.max(...latitudes);

  return {
    minLon,
    maxLon,
    minLat,
    maxLat,

    centerLon:
      (minLon + maxLon) / 2,

    centerLat:
      (minLat + maxLat) / 2,
  };
}

/* =========================================================
   APP
========================================================= */

function App() {

  const navigate = useNavigate();

  const [authUser, setAuthUser] = useState<AuthUser | null>(
    getAuthUser()
  );

  const handleLogout = () => {
    clearAuthData();
    setAuthUser(null);
    window.location.href = "/login";
  };
  /* =======================================================
     CESIUM REFS
  ======================================================= */

  const cesiumContainerRef =
    useRef<HTMLDivElement | null>(null);

  const viewerRef =
    useRef<Viewer | null>(null);

  const eventHandlerRef =
    useRef<ScreenSpaceEventHandler | null>(
      null
    );

  /*
   * IMPORTANT:
   * Cesium click handler is created only once.
   * These refs keep it synchronized with
   * the latest React data.
   */

  const parcelsRef =
    useRef<Parcel[]>([]);

  const propertyUnitsRef =
    useRef<PropertyUnit[]>([]);

  const initialCameraSetRef =
    useRef(false);

  /*
   * VPID deep-link support.
   *
   * Citizen Portal opens:
   * /dashboard?vpid=12345678901236-B05-F01-U101
   */
  const deepLinkedVpidRef =
    useRef<string | null>(null);

  /* =======================================================
     STATE
  ======================================================= */

  const [parcels, setParcels] =
    useState<Parcel[]>([]);

  const [selectedParcel, setSelectedParcel] =
    useState<Parcel | null>(null);

  const [building, setBuilding] =
    useState<Building | null>(null);

  const [floors, setFloors] =
    useState<Floor[]>([]);

  const [propertyUnits, setPropertyUnits] =
    useState<PropertyUnit[]>([]);

  const [selectedFloor, setSelectedFloor] =
    useState<number | null>(null);

  const [explodedView, setExplodedView] =
    useState(false);

  const [selectedUnit, setSelectedUnit] =
    useState<PropertyUnit | null>(null);

  const [propertyDetails, setPropertyDetails] =
    useState<PropertyDetails | null>(null);

  const [
    propertyDetailsLoading,
    setPropertyDetailsLoading,
  ] = useState(false);

  const [searchText, setSearchText] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [apiError, setApiError] =
    useState("");

  const [
    generateBuildingOpen,
    setGenerateBuildingOpen,
  ] = useState(false);

  /* =======================================================
     KEEP REFS UPDATED
  ======================================================= */

  useEffect(() => {
    parcelsRef.current =
      parcels;
  }, [parcels]);

  useEffect(() => {
    propertyUnitsRef.current =
      propertyUnits;
  }, [propertyUnits]);

  /* =======================================================
     LOAD PARCELS
  ======================================================= */

  useEffect(() => {
    const loadParcels =
      async () => {
        try {
          setLoading(true);
          setApiError("");

          const response =
            await apiFetch(
              `${API_URL}/parcels`
            );

          if (!response.ok) {
            throw new Error(
              `Parcel API returned ${response.status}`
            );
          }

          const data =
            await response.json();

          if (
            !Array.isArray(
              data.parcels
            )
          ) {
            throw new Error(
              "Invalid parcel response"
            );
          }

          setParcels(
            data.parcels
          );
        } catch (error) {
          console.error(
            "Failed to load parcels:",
            error
          );

          setApiError(
            "Could not connect to ULPIN API"
          );
        } finally {
          setLoading(false);
        }
      };

    loadParcels();
  }, []);

  /* =======================================================
     LOAD BUILDING + FLOORS + PROPERTY UNITS
  ======================================================= */

  useEffect(() => {
    const loadBuilding = async () => {
      try {
        setApiError("");

        /*
         * Load all available buildings.
         */
        const response = await apiFetch(
          `${API_URL}/buildings`
        );

        if (!response.ok) {
          throw new Error(
            `Building API returned ${response.status}`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data.buildings)) {
          throw new Error(
            "Invalid buildings response"
          );
        }

        const buildings: Building[] =
          data.buildings;

        if (buildings.length === 0) {
          setBuilding(null);
          setFloors([]);
          setPropertyUnits([]);
          return;
        }

        /*
         * Normally the explorer shows the newest building.
         *
         * If the Citizen Portal opened this page with a VPID,
         * first resolve that VPID to its real building ID.
         * This is important because multiple buildings can use
         * the same parent ULPIN and therefore the newest building
         * is not necessarily the citizen's property.
         */
        const requestedVpid =
          new URLSearchParams(
            window.location.search
          )
            .get("vpid")
            ?.trim();

        let selectedBuilding: Building | null =
          null;

        if (requestedVpid) {
          try {
            const propertyResponse =
              await apiFetch(
                `${API_URL}/property-units/${encodeURIComponent(
                  requestedVpid
                )}`
              );

            if (propertyResponse.ok) {
              const propertyData =
                await propertyResponse.json();

              const targetBuildingId =
                propertyData.property?.building?.id;

              if (targetBuildingId) {
                selectedBuilding =
                  buildings.find(
                    (item) =>
                      item.id ===
                      targetBuildingId
                  ) ?? null;
              }
            }
          } catch (error) {
            console.warn(
              "Could not resolve deep-linked VPID to a building:",
              error
            );
          }
        }

        /*
         * Fall back to the newest generated building when there
         * is no VPID or the VPID could not be resolved.
         */
        if (!selectedBuilding) {
          selectedBuilding =
            buildings
              .slice()
              .sort(
                (a, b) =>
                  new Date(
                    b.created_at ?? ""
                  ).getTime() -
                  new Date(
                    a.created_at ?? ""
                  ).getTime()
              )[0];
        }

        /*
         * Load complete 3D data for the selected building.
         */
        const buildingResponse =
          await apiFetch(
            `${API_URL}/buildings/${selectedBuilding.id}/3d`
          );

        if (!buildingResponse.ok) {
          throw new Error(
            `Building 3D API returned ${buildingResponse.status}`
          );
        }

        const buildingData: Building3DResponse =
          await buildingResponse.json();

        setBuilding(
          buildingData.building
        );

        setFloors(
          buildingData.floors ?? []
        );

        setPropertyUnits(
          buildingData.property_units ?? []
        );

        console.log(
          "Available buildings:",
          buildings
        );

        console.log(
          "Selected building:",
          buildingData.building
        );

        console.log(
          "Floors loaded:",
          buildingData.floors
        );

        console.log(
          "Property units loaded:",
          buildingData.property_units
        );
      } catch (error) {
        console.error(
          "Building loading error:",
          error
        );

        setApiError(
          "Building data could not be loaded"
        );
      }
    };

    void loadBuilding();
  }, []);

  /* =======================================================
     LOAD COMPLETE PROPERTY DETAILS
  ======================================================= */

  const loadPropertyDetails =
    async (
      verticalPropertyId: string
    ) => {
      try {
        setPropertyDetailsLoading(
          true
        );

        const response =
          await apiFetch(
            `${API_URL}/property-units/${encodeURIComponent(
              verticalPropertyId
            )}`
          );

        if (!response.ok) {
          throw new Error(
            `Property API returned ${response.status}`
          );
        }

        const data =
          await response.json();

        if (data.property) {
          setPropertyDetails(
            data.property
          );
        } else {
          setPropertyDetails(
            null
          );
        }
      } catch (error) {
        console.error(
          "Property details loading error:",
          error
        );

        setPropertyDetails(
          null
        );
      } finally {
        setPropertyDetailsLoading(
          false
        );
      }
    };

  /* =======================================================
     OPEN PROPERTY FROM CITIZEN PORTAL DEEP LINK

     Citizen Portal opens:
     /dashboard?vpid=12345678901236-B05-F01-U101

     IMPORTANT:
     This effect only selects the requested property.
     Camera movement is handled separately after the
     Cesium unit entity has actually been rendered.
  ======================================================= */

  useEffect(() => {
    const requestedVpid =
      new URLSearchParams(window.location.search)
        .get("vpid")
        ?.trim();

    if (!requestedVpid) {
      deepLinkedVpidRef.current = null;
      return;
    }

    if (propertyUnits.length === 0) {
      return;
    }

    if (
      deepLinkedVpidRef.current ===
      requestedVpid
    ) {
      return;
    }

    const foundUnit =
      propertyUnits.find(
        (unit) =>
          unit.vertical_property_id
            .toLowerCase() ===
          requestedVpid.toLowerCase()
      );

    if (!foundUnit) {
      console.warn(
        "Deep-linked VPID was not found:",
        requestedVpid
      );

      setApiError(
        `Property ${requestedVpid} was not found in the loaded 3D data.`
      );

      deepLinkedVpidRef.current =
        requestedVpid;

      return;
    }

    deepLinkedVpidRef.current =
      requestedVpid;

    console.log(
      "Opening deep-linked property:",
      foundUnit.vertical_property_id
    );

    setApiError("");
    setSelectedParcel(null);
    setSelectedUnit(foundUnit);
    setSelectedFloor(foundUnit.floor_number);
    setExplodedView(false);

    void loadPropertyDetails(
      foundUnit.vertical_property_id
    );
  }, [
    propertyUnits,
  ]);

  /* =======================================================
     FLY TO DEEP-LINKED PROPERTY

     This runs AFTER selectedUnit changes, which gives the
     property-unit rendering effect time to create the Cesium
     entity. It retries briefly because Cesium rendering and
     React effects can complete in different cycles.
  ======================================================= */

  useEffect(() => {
    if (!selectedUnit) {
      return;
    }

    const requestedVpid =
      new URLSearchParams(window.location.search)
        .get("vpid")
        ?.trim();

    if (
      !requestedVpid ||
      selectedUnit.vertical_property_id.toLowerCase() !==
        requestedVpid.toLowerCase()
    ) {
      return;
    }

    let attempts = 0;
    let timeoutId: number | null = null;

    const tryFlyToProperty = () => {
      const viewer = viewerRef.current;

      if (
        !viewer ||
        viewer.isDestroyed()
      ) {
        if (attempts < 20) {
          attempts += 1;
          timeoutId = window.setTimeout(
            tryFlyToProperty,
            150
          );
        }
        return;
      }

      const entity =
        viewer.entities.getById(
          `unit-${selectedUnit.id}`
        );

      if (entity) {
        console.log(
          "Flying to deep-linked property:",
          selectedUnit.vertical_property_id
        );

        void viewer.flyTo(
          entity,
          {
            duration: 1.6,
          }
        );

        return;
      }

      if (attempts < 20) {
        attempts += 1;
        timeoutId = window.setTimeout(
          tryFlyToProperty,
          150
        );
      } else {
        console.warn(
          "Could not find Cesium entity for VPID:",
          selectedUnit.vertical_property_id
        );
      }
    };

    timeoutId = window.setTimeout(
      tryFlyToProperty,
      150
    );

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    selectedUnit,
  ]);

  /* =======================================================
     CREATE CESIUM VIEWER
     
     IMPORTANT:
     Viewer is created ONLY ONCE.
  ======================================================= */

  useEffect(() => {
    if (
      !cesiumContainerRef.current
    ) {
      return;
    }

    if (viewerRef.current) {
      return;
    }

    const osmProvider =
      new OpenStreetMapImageryProvider(
        {
          url:
            "http://localhost:5000/api/map/tiles/",
            maximumLevel: 19,
        }
      );

    const viewer =
      new Viewer(
        cesiumContainerRef.current,
        {
          baseLayer:
            new ImageryLayer(
              osmProvider
            ),

          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,

          homeButton: true,
          sceneModePicker: true,
          navigationHelpButton: false,
          fullscreenButton: true,

          selectionIndicator: false,
          infoBox: false,
          shadows: false,
        }
      );

    viewer.scene.globe.show =
      true;

    viewer.scene.globe.depthTestAgainstTerrain =
      false;

    viewerRef.current =
      viewer;

    /* =====================================================
       CLICK HANDLER
       
       IMPORTANT FIX:
       We use drillPick so that if a label,
       floor or another entity is on top,
       we can still find the actual unit.
    ===================================================== */

    const handler =
      new ScreenSpaceEventHandler(
        viewer.scene.canvas
      );

    handler.setInputAction(
      async (
        movement: {
          position: Cartesian2;
        }
      ) => {
        if (
          viewer.isDestroyed()
        ) {
          return;
        }

        /*
         * Pick multiple objects at
         * the clicked screen position.
         */

        const pickedObjects =
          viewer.scene.drillPick(
            movement.position,
            10
          );

        if (
          !pickedObjects ||
          pickedObjects.length === 0
        ) {
          return;
        }

        /*
         * =================================================
         * 1. FIRST LOOK FOR PROPERTY UNIT
         * =================================================
         */

        for (
          const pickedObject of pickedObjects
        ) {
          const entity =
            pickedObject?.id;

          if (
            !entity ||
            !entity.properties
          ) {
            continue;
          }

          const propertyId =
            entity.properties
              .verticalPropertyId
              ?.getValue?.();

          if (
            propertyId
          ) {
            const foundUnit =
              propertyUnitsRef.current.find(
                (unit) =>
                  unit.vertical_property_id ===
                  propertyId
              );

            if (!foundUnit) {
              continue;
            }

            console.log(
              "UNIT CLICKED:",
              foundUnit.vertical_property_id
            );

            setSelectedParcel(
              null
            );

            setSelectedUnit(
              foundUnit
            );

            setSelectedFloor(
              foundUnit.floor_number
            );

            await loadPropertyDetails(
              foundUnit.vertical_property_id
            );

            return;
          }
        }

        /*
         * =================================================
         * 2. PARCEL CLICK
         * =================================================
         */

        for (
          const pickedObject of pickedObjects
        ) {
          const entity =
            pickedObject?.id;

          if (
            !entity ||
            !entity.properties
          ) {
            continue;
          }

          const parcelId =
            entity.properties
              .parcelId
              ?.getValue?.();

          if (!parcelId) {
            continue;
          }

          const foundParcel =
            parcelsRef.current.find(
              (parcel) =>
                parcel.id ===
                parcelId
            );

          if (!foundParcel) {
            continue;
          }

          setSelectedParcel(
            foundParcel
          );

          setSelectedUnit(
            null
          );

          setPropertyDetails(
            null
          );

          return;
        }

        /*
         * =================================================
         * 3. FLOOR CLICK
         * =================================================
         */

        for (
          const pickedObject of pickedObjects
        ) {
          const entity =
            pickedObject?.id;

          if (
            !entity ||
            !entity.properties
          ) {
            continue;
          }

          const floorNumber =
            entity.properties
              .floorNumber
              ?.getValue?.();

          if (
            floorNumber !==
            undefined &&
            floorNumber !==
            null
          ) {
            setSelectedFloor(
              Number(
                floorNumber
              )
            );

            setSelectedUnit(
              null
            );

            setPropertyDetails(
              null
            );

            return;
          }
        }
      },
      ScreenSpaceEventType.LEFT_CLICK
    );

    eventHandlerRef.current =
      handler;

    /* =====================================================
       CLEANUP
    ===================================================== */

    return () => {
      if (
        !handler.isDestroyed()
      ) {
        handler.destroy();
      }

      eventHandlerRef.current =
        null;

      if (
        !viewer.isDestroyed()
      ) {
        viewer.destroy();
      }

      viewerRef.current =
        null;
    };
  }, []);

  /* =======================================================
     RENDER PARCELS
  ======================================================= */

  useEffect(() => {
    const viewer =
      viewerRef.current;

    if (
      !viewer ||
      viewer.isDestroyed()
    ) {
      return;
    }

    /*
     * Remove old parcel entities.
     */

    const oldParcelEntities =
      viewer.entities.values.filter(
        (entity) =>
          entity.id.startsWith(
            "parcel-"
          )
      );

    oldParcelEntities.forEach(
      (entity) => {
        viewer.entities.remove(
          entity
        );
      }
    );

    /*
     * Add current parcels.
     */

    parcels.forEach(
      (parcel) => {
        if (
          !parcel.geometry
        ) {
          return;
        }

        const positions =
          getParcelPositions(
            parcel,
            Number(
              parcel.base_elevation_m ??
              0
            )
          );

        if (
          positions.length < 3
        ) {
          return;
        }

        const isSelected =
          selectedParcel?.id ===
          parcel.id;

        viewer.entities.add({
          id:
            `parcel-${parcel.id}`,

          name:
            `ULPIN ${parcel.ulpin}`,

          polygon: {
            hierarchy:
              positions,

            material:
              isSelected
                ? Color.ORANGE.withAlpha(
                  0.28
                )
                : Color.CYAN.withAlpha(
                  0.12
                ),

            outline: false,

            outlineColor:
              isSelected
                ? Color.YELLOW
                : Color.CYAN,

            heightReference:
              HeightReference.NONE,
          },

          properties: {
            parcelId:
              parcel.id,

            ulpin:
              parcel.ulpin,

            parcelEntity:
              true,
          },
        });
      }
    );
  }, [
    parcels,
    selectedParcel,
  ]);

  /* =======================================================
     RENDER BUILDING / FLOORS
  ======================================================= */

  useEffect(() => {
    const viewer =
      viewerRef.current;

    if (
      !viewer ||
      viewer.isDestroyed() ||
      !building ||
      floors.length === 0 ||
      parcels.length === 0
    ) {
      return;
    }

    const parcel =
      parcels.find(
        (item) =>
          item.id ===
          building.parcel_id
      );

    if (!parcel) {
      return;
    }

    const bounds =
      getParcelBounds(
        parcel
      );

    if (!bounds) {
      return;
    }

    /*
     * Remove previous floor entities.
     */

    const oldFloorEntities =
      viewer.entities.values.filter(
        (entity) =>
          entity.id.startsWith(
            "floor-"
          )
      );

    oldFloorEntities.forEach(
      (entity) => {
        viewer.entities.remove(
          entity
        );
      }
    );

    /*
     * Render floors.
     */

    floors.forEach(
      (floor) => {
        const visible =
          selectedFloor ===
          null ||
          selectedFloor ===
          floor.floor_number;

        if (!visible) {
          return;
        }

        const explosion =
          explodedView
            ? (floor.floor_number - 1) *
            EXPLOSION_DISTANCE
            : 0;

        const floorPositions =
          Cartesian3.fromDegreesArray(
            [
              bounds.minLon,
              bounds.minLat,

              bounds.maxLon,
              bounds.minLat,

              bounds.maxLon,
              bounds.maxLat,

              bounds.minLon,
              bounds.maxLat,
            ]
          );

        viewer.entities.add({
          id:
            `floor-${floor.id}`,

          name:
            floor.floor_label,

          polygon: {
            hierarchy:
              floorPositions,

            height:
              Number(
                floor.min_z
              ) +
              explosion,

            extrudedHeight:
              Number(
                floor.max_z
              ) +
              explosion,

            heightReference:
              HeightReference.NONE,

            extrudedHeightReference:
              HeightReference.NONE,

            material:
              Color.DARKCYAN.withAlpha(
                0.38
              ),

            outline: true,

            outlineColor:
              Color.CYAN.withAlpha(
                0.9
              ),
          },

          properties: {
            floorEntity:
              true,

            floorNumber:
              floor.floor_number,

            floorId:
              floor.id,
          },
        });
      }
    );
  }, [
    building,
    floors,
    parcels,
    selectedFloor,
    explodedView,
  ]);

  /* =======================================================
     RENDER PROPERTY UNITS
  ======================================================= */

  useEffect(() => {
    const viewer =
      viewerRef.current;

    if (
      !viewer ||
      viewer.isDestroyed()
    ) {
      return;
    }

    /*
     * Remove old unit volumes.
     */

    const oldUnitEntities =
      viewer.entities.values.filter(
        (entity) =>
          entity.id.startsWith(
            "unit-"
          )
      );

    oldUnitEntities.forEach(
      (entity) => {
        viewer.entities.remove(
          entity
        );
      }
    );

    /*
     * Remove old labels.
     */

    const oldLabelEntities =
      viewer.entities.values.filter(
        (entity) =>
          entity.id.startsWith(
            "unit-label-"
          )
      );

    oldLabelEntities.forEach(
      (entity) => {
        viewer.entities.remove(
          entity
        );
      }
    );

    if (
      !building ||
      propertyUnits.length === 0 ||
      parcels.length === 0
    ) {
      return;
    }

    const parcel =
      parcels.find(
        (item) =>
          item.id ===
          building.parcel_id
      );

    const bounds =
      getParcelBounds(
        parcel || null
      );

    if (!bounds) {
      return;
    }

    /*
     * Only units belonging
     * to this building.
     */

    const buildingUnits =
      propertyUnits.filter(
        (unit) =>
          unit.building_id ===
          building.id
      );

    /*
     * Keep only actual units
     * returned for this building.
     */

    const units =
      buildingUnits;

    /*
     * Four units per floor.
     */

    const unitsPerFloor = 4;

    const unitWidth =
      (bounds.maxLon -
        bounds.minLon) /
      unitsPerFloor;

    units.forEach(
      (unit) => {
        /*
         * Floor filter.
         */

        if (
          selectedFloor !==
          null &&
          unit.floor_number !==
          selectedFloor
        ) {
          return;
        }

        const numericUnit =
          Number(
            unit.unit_number
          );

        if (
          !Number.isFinite(
            numericUnit
          )
        ) {
          return;
        }

        /*
         * 101 -> 1
         * 102 -> 2
         * 103 -> 3
         * 104 -> 4
         *
         * 201 -> 1
         * etc.
         */

        const unitIndex =
          ((numericUnit % 100) ||
            1) -
          1;

        if (
          unitIndex < 0 ||
          unitIndex >=
          unitsPerFloor
        ) {
          return;
        }

        const minLon =
          bounds.minLon +
          unitIndex *
          unitWidth;

        const maxLon =
          minLon +
          unitWidth;

        const minLat =
          bounds.minLat;

        const maxLat =
          bounds.maxLat;

        const minZ =
          Number(
            unit.min_z
          );

        const maxZ =
          Number(
            unit.max_z
          );

        if (
          !Number.isFinite(
            minZ
          ) ||
          !Number.isFinite(
            maxZ
          )
        ) {
          return;
        }

        /*
         * Explosion offset.
         */

        const explosion =
          explodedView
            ? (unit.floor_number -
              1) *
            EXPLOSION_DISTANCE
            : 0;

        /*
         * Unit rectangle.
         */

        const unitCoordinates = [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ];

        const positions =
          unitCoordinates.map(
            ([
              longitude,
              latitude,
            ]) =>
              Cartesian3.fromDegrees(
                longitude,
                latitude,
                minZ +
                explosion
              )
          );

        /*
         * Selected unit styling.
         */

        const isSelected =
          selectedUnit?.id ===
          unit.id;

        const material =
          isSelected
            ? Color.fromCssColorString(
              "#f39c12"
            ).withAlpha(
              0.92
            )
            : Color.fromCssColorString(
              "#3498db"
            ).withAlpha(
              0.42
            );

        /* =================================================
           UNIT VOLUME
        ================================================= */

        viewer.entities.add({
          id:
            `unit-${unit.id}`,

          name:
            unit.vertical_property_id,

          properties: {
            unitId:
              unit.id,

            verticalPropertyId:
              unit.vertical_property_id,

            unitNumber:
              unit.unit_number,

            floorNumber:
              unit.floor_number,
          },

          polygon: {
            hierarchy:
              positions,

            material,

            outline: true,

            outlineColor:
              Color.WHITE,

            outlineWidth:
              isSelected
                ? 3
                : 2,

            height:
              minZ +
              explosion,

            extrudedHeight:
              maxZ +
              explosion,

            heightReference:
              HeightReference.NONE,

            extrudedHeightReference:
              HeightReference.NONE,
          },
        });

        /* =================================================
           UNIT LABEL
        ================================================= */

        const centerLon =
          (minLon +
            maxLon) /
          2;

        const centerLat =
          (minLat +
            maxLat) /
          2;

        const labelHeight =
          maxZ +
          explosion +
          0.8;

        viewer.entities.add({
          id:
            `unit-label-${unit.id}`,

          position:
            Cartesian3.fromDegrees(
              centerLon,
              centerLat,
              labelHeight
            ),

          label: {
            text:
              `U${unit.unit_number}`,

            font:
              "700 12px sans-serif",

            fillColor:
              Color.WHITE,

            outlineColor:
              Color.BLACK,

            outlineWidth: 3,

            style:
              LabelStyle.FILL_AND_OUTLINE,

            verticalOrigin:
              VerticalOrigin.BOTTOM,

            showBackground: true,

            backgroundColor:
              Color.fromCssColorString(
                "#0f172a"
              ).withAlpha(
                0.88
              ),

            backgroundPadding:
              new Cartesian2(
                5,
                3
              ),

            disableDepthTestDistance:
              Number.POSITIVE_INFINITY,
          },

          /*
           * VERY IMPORTANT:
           * The label also gets the same
           * property information.
           *
           * Therefore clicking the
           * U201 text itself works.
           */

          properties: {
            unitId:
              unit.id,

            verticalPropertyId:
              unit.vertical_property_id,

            unitNumber:
              unit.unit_number,

            floorNumber:
              unit.floor_number,
          },
        });
      }
    );
  }, [
    building,
    propertyUnits,
    parcels,
    selectedFloor,
    explodedView,
    selectedUnit,
  ]);

  /* =======================================================
     INITIAL CAMERA
     
     ONLY RUNS ONCE.
  ======================================================= */

  useEffect(() => {
    const viewer =
      viewerRef.current;

    if (
      !viewer ||
      viewer.isDestroyed()
    ) {
      return;
    }

    if (
      initialCameraSetRef.current
    ) {
      return;
    }

    if (!building) {
      return;
    }

    const parentParcel =
      parcels.find(
        (parcel) =>
          parcel.id ===
          building.parcel_id
      );

    if (
      !parentParcel?.geometry
    ) {
      return;
    }

    const positions =
      getParcelPositions(
        parentParcel,
        Number(
          building.base_elevation_m ??
          215
        )
      );

    if (
      positions.length < 3
    ) {
      return;
    }

    viewer.camera.flyToBoundingSphere(
      calculateBoundingSphere(
        positions
      ),
      {
        duration: 1.2,

        offset: {
          heading: 0.8,
          pitch: -0.62,
          range: 850,
        },
      }
    );

    initialCameraSetRef.current =
      true;
  }, [
    building,
    parcels,
  ]);

  /* =======================================================
     LOCATE BUILDING
     
     THIS IS THE ONLY CONTROL THAT
     INTENTIONALLY MOVES THE CAMERA.
  ======================================================= */

  const locateBuilding =
    () => {
      const viewer =
        viewerRef.current;

      if (
        !viewer ||
        viewer.isDestroyed() ||
        !building
      ) {
        return;
      }

      const parentParcel =
        parcels.find(
          (parcel) =>
            parcel.id ===
            building.parcel_id
        );

      if (
        !parentParcel?.geometry
      ) {
        return;
      }

      const positions =
        getParcelPositions(
          parentParcel,
          Number(
            building.base_elevation_m ??
            215
          )
        );

      if (
        positions.length < 3
      ) {
        return;
      }

      viewer.camera.flyToBoundingSphere(
        calculateBoundingSphere(
          positions
        ),
        {
          duration: 1.4,

          offset: {
            heading: 0.8,
            pitch: -0.65,
            range: 450,
          },
        }
      );
    };

  /* =======================================================
     NORMAL VIEW
     
     IMPORTANT:
     NO CAMERA MOVEMENT.
     
     This only restores the model.
  ======================================================= */

  const normalView =
    () => {
      /*
       * Collapse exploded floors.
       */

      setExplodedView(false);

      /*
       * Show all floors.
       */

      setSelectedFloor(null);

      /*
       * Keep selected property
       * information intact.
       *
       * Most importantly:
       * DO NOT call locateBuilding()
       * DO NOT call camera.flyTo()
       */
    };

  /* =======================================================
     FLOOR SELECTION
     
     NO CAMERA MOVEMENT.
  ======================================================= */

  const selectFloor =
    (
      floorNumber: number | null
    ) => {
      setSelectedFloor(
        floorNumber
      );

      setSelectedUnit(
        null
      );

      setPropertyDetails(
        null
      );
    };

  /* =======================================================
     CLOSE PROPERTY DETAILS
  ======================================================= */

  const closeDetails =
    () => {
      setSelectedUnit(
        null
      );

      setPropertyDetails(
        null
      );

      setPropertyDetailsLoading(
        false
      );
    };

  /* =======================================================
     SEARCH
  ======================================================= */

  const handleSearch =
    async () => {
      const value =
        searchText
          .trim()
          .toLowerCase();

      if (!value) {
        return;
      }

      /* =================================================
         SEARCH PROPERTY UNIT
      ================================================= */

      const foundUnit =
        propertyUnits.find(
          (unit) =>
            unit.vertical_property_id
              .toLowerCase() ===
            value ||
            unit.parent_ulpin
              .toLowerCase() ===
            value ||
            unit.unit_number
              .toLowerCase() ===
            value
        );

      if (foundUnit) {
        setSelectedUnit(
          foundUnit
        );

        setSelectedParcel(
          null
        );

        setSelectedFloor(
          foundUnit.floor_number
        );

        await loadPropertyDetails(
          foundUnit.vertical_property_id
        );

        /*
         * Move to the selected unit.
         */

        window.setTimeout(
          () => {
            const viewer =
              viewerRef.current;

            if (
              !viewer ||
              viewer.isDestroyed()
            ) {
              return;
            }

            const entity =
              viewer.entities.getById(
                `unit-${foundUnit.id}`
              );

            if (entity) {
              viewer.flyTo(
                entity,
                {
                  duration: 1.5,
                }
              );
            } else {
              locateBuilding();
            }
          },
          250
        );

        return;
      }

      /* =================================================
         SEARCH PARCEL / ULPIN
      ================================================= */

      const foundParcel =
        parcels.find(
          (parcel) => {
            const ulpin =
              parcel.ulpin
                ?.toLowerCase() ??
              "";

            const parcelNumber =
              parcel.parcel_number
                ?.toLowerCase() ??
              "";

            return (
              ulpin === value ||
              parcelNumber ===
              value ||
              ulpin.includes(value) ||
              parcelNumber.includes(
                value
              )
            );
          }
        );

      if (foundParcel) {
        setSelectedParcel(
          foundParcel
        );

        setSelectedUnit(
          null
        );

        setPropertyDetails(
          null
        );

        if (
          !foundParcel.geometry
        ) {
          return;
        }

        const positions =
          getParcelPositions(
            foundParcel,
            Number(
              foundParcel.base_elevation_m ??
              0
            )
          );

        if (
          positions.length < 3
        ) {
          return;
        }

        const viewer =
          viewerRef.current;

        if (
          !viewer ||
          viewer.isDestroyed()
        ) {
          return;
        }

        viewer.camera.flyToBoundingSphere(
          calculateBoundingSphere(
            positions
          ),
          {
            duration: 1.5,

            offset: {
              heading: 0.8,
              pitch: -0.6,
              range: 800,
            },
          }
        );

        return;
      }

      window.alert(
        "No matching VPID, ULPIN or property found."
      );
    };

  /* =======================================================
     ENTER KEY SEARCH
  ======================================================= */

  const handleSearchKeyDown =
    (
      event: React.KeyboardEvent<HTMLInputElement>
    ) => {
      if (
        event.key ===
        "Enter"
      ) {
        void handleSearch();
      }
    };

  /* =======================================================
   SIDEBAR MENU
======================================================= */

const handleMenuClick = (
  name: string
) => {
  /*
   * ================================================
   * GENERATE NEW BUILDING
   * ================================================
   */

  if (
    name ===
    "Generate New Building"
  ) {
    if (
      authUser?.role !== "ADMIN" &&
      authUser?.role !==
        "GOVERNMENT_OFFICER" &&
      authUser?.role !==
        "SURVEYOR"
    ) {
      window.alert(
        "You do not have permission to generate a building."
      );

      return;
    }

    setGenerateBuildingOpen(
      true
    );

    return;
  }

  /*
   * ================================================
   * EDIT EXISTING BUILDING
   * ================================================
   */

  if (
    name ===
    "Edit Existing Building"
  ) {
    navigate(
      "/edit-building"
    );

    return;
  }

  /*
   * ================================================
   * OTHER MENU ITEMS
   * ================================================
   */

  window.alert(
    `${name} module will be connected next.`
  );
};

  const handleBuildingGenerated = async (
    buildingId: string
  ) => {
    try {
      setApiError("");

      const response = await apiFetch(
        `${API_URL}/property-units/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            building_id: buildingId,
            units_per_floor: 4,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Property units could not be generated"
        );
      }

      console.log(
        "Property units generated:",
        data
      );

      setGenerateBuildingOpen(false);

      setSelectedParcel(null);
      setSelectedFloor(null);
      setSelectedUnit(null);
      setPropertyDetails(null);

      window.alert(
        `3D building generated successfully.\n\n` +
        `Building ID: ${buildingId}\n` +
        `Property Units: ${data.total_units}`
      );

      /*
       * Reload dashboard so the newly generated
       * building and property units are loaded.
       */
      window.location.reload();
    } catch (error) {
      console.error(
        "Property unit generation error:",
        error
      );

      window.alert(
        error instanceof Error
          ? error.message
          : "Building was created, but property units could not be generated."
      );
    }
  };

  /* =======================================================
     FORMAT MONEY
  ======================================================= */

  const formatMoney =
    (
      value:
        | number
        | null
        | undefined
    ) => {
      if (
        value === null ||
        value === undefined
      ) {
        return "—";
      }

      return new Intl.NumberFormat(
        "en-IN",
        {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        }
      ).format(value);
    };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="app">

      {/* =================================================
          TOP BAR
      ================================================= */}

      <header className="topbar">

        <div className="user-session">
          {authUser && (
            <>
              <div className="user-info">
                <strong>{authUser.name}</strong>
                <span>{authUser.role}</span>
              </div>

              <button
                type="button"
                className="logout-button"
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          )}
        </div>

        <div>
          <div className="brand-title">
            3D ULPIN
          </div>

          <div className="brand-subtitle">
            3D Cadastral & Vertical Property Mapping
          </div>
        </div>

        <div className="search-box">

          <input
            type="text"
            value={searchText}
            onChange={(event) =>
              setSearchText(
                event.target.value
              )
            }
            onKeyDown={
              handleSearchKeyDown
            }
            placeholder="Search VPID / ULPIN"
          />

          <button
            type="button"
            onClick={() => {
              void handleSearch();
            }}
          >
            Search
          </button>

        </div>

      </header>

      {/* =================================================
          WORKSPACE
      ================================================= */}

      <div className="workspace">

        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside className="sidebar">

          <div className="sidebar-title">
            DASHBOARD
          </div>

          <button
            type="button"
            className="menu-item"
            onClick={() =>
              handleMenuClick(
                "Generate New Building"
              )
            }
          >
            <span className="menu-icon">
              🏗️
            </span>

            <span>
              Generate New Building
            </span>
          </button>

          <button
            type="button"
            className="menu-item"
            onClick={() =>
              handleMenuClick(
                "Edit Existing Building"
              )
            }
          >
            <span className="menu-icon">
              🛠️
            </span>

            <span>
              Edit Existing Building
            </span>
          </button>

          <button
            type="button"
            className="menu-item"
            onClick={() =>
              handleMenuClick(
                "Convert 2D → 3D"
              )
            }
          >
            <span className="menu-icon">
              🗺️
            </span>

            <span>
              Convert 2D → 3D
            </span>
          </button>

          <button
            type="button"
            className="menu-item"
            onClick={() => {
              const input =
                document.querySelector<HTMLInputElement>(
                  ".search-box input"
                );

              input?.focus();
            }}
          >
            <span className="menu-icon">
              🔍
            </span>

            <span>
              Search Property
            </span>
          </button>

          <button
            type="button"
            className="menu-item"
            onClick={
              locateBuilding
            }
          >
            <span className="menu-icon">
              🌐
            </span>

            <span>
              3D Explorer
            </span>
          </button>

          {/* =================================================
              SYSTEM STATUS
          ================================================= */}

          <div
            style={{
              marginTop: "18px",
              padding: "0 12px",
              fontSize: "12px",
              lineHeight: 1.55,
            }}
          >
            <strong>
              System Status
            </strong>

            <div>
              •{" "}
              {apiError
                ? "API Error"
                : "API Connected"}
            </div>

            <div>
              {parcels.length} parcel records
            </div>

            <div>
              {
                parcels.filter(
                  (parcel) =>
                    parcel.geometry
                ).length
              }{" "}
              mapped parcels
            </div>

            <div>
              {building
                ? "1 building loaded"
                : "0 buildings"}
            </div>

            <div>
              {floors.length} floors
            </div>

            <div>
              {propertyUnits.length} property units
            </div>
          </div>

        </aside>

        {/* =================================================
            VIEWER
        ================================================= */}

        <main className="viewer">

          <div
            ref={cesiumContainerRef}
            className="cesium-container"
          />

          {/* =================================================
              3D EXPLORER
          ================================================= */}

          {building && (
            <div className="explorer-panel" style={{ maxHeight: "650px", overflowY: "auto", overflowX: "hidden" }}>

              <div className="explorer-title">
                3D EXPLORER
              </div>

              <div className="explorer-building">
                {building.building_name}
              </div>

              {/* ALL FLOORS */}

              <button
                type="button"
                className={`floor-button ${selectedFloor ===
                  null
                  ? "active"
                  : ""
                  }`}
                onClick={() =>
                  selectFloor(null)
                }
              >
                ALL FLOORS
              </button>

              {/* FLOOR BUTTONS */}

              {floors
                .slice()
                .sort(
                  (a, b) =>
                    b.floor_number -
                    a.floor_number
                )
                .map(
                  (floor) => (
                    <button
                      key={
                        floor.id
                      }
                      type="button"
                      className={`floor-button ${selectedFloor ===
                        floor.floor_number
                        ? "active"
                        : ""
                        }`}
                      onClick={() =>
                        selectFloor(
                          floor.floor_number
                        )
                      }
                    >
                      F
                      {
                        floor.floor_number
                      }
                    </button>
                  )
                )}

              {/* EXPLODED VIEW */}

              <button
                type="button"
                className={`explode-button ${explodedView
                  ? "active"
                  : ""
                  }`}
                onClick={() =>
                  setExplodedView(
                    (value) =>
                      !value
                  )
                }
              >
                {explodedView
                  ? "✓ EXPLODED VIEW"
                  : "⇅ EXPLODED VIEW"}
              </button>

              {/* NORMAL VIEW */}

              <button
                type="button"
                className="explode-button"
                onClick={
                  normalView
                }
                style={{
                  background:
                    "rgba(255,255,255,0.08)",
                  color:
                    "#ffffff",
                }}
              >
                ↕ NORMAL VIEW
              </button>

              {/* LOCATE BUILDING */}

              <button
                type="button"
                className="explode-button"
                onClick={
                  locateBuilding
                }
                style={{
                  background:
                    "rgba(236,72,153,0.12)",
                  color:
                    "#f9a8d4",
                }}
              >
                📍 LOCATE BUILDING
              </button>

            </div>
          )}

          {/* =================================================
              BUILDING BADGE
          ================================================= */}

          {building && (
            <div className="building-badge">

              <div className="building-badge-title">
                🏢{" "}
                {building.building_name}
              </div>

              <div
                style={{
                  marginTop: "4px",
                  fontSize: "10px",
                  color: "#67e8f9",
                  letterSpacing: "0.4px",
                }}
              >
                ULPIN: {building.ulpin}
              </div>

              <span>
                {building.floors} Floors •{" "}
                {propertyUnits.length} Units
              </span>

            </div>
          )}

          {/* =================================================
              API ERROR
          ================================================= */}

          {apiError && (
            <div
              style={{
                position:
                  "absolute",
                top: 90,
                left: "50%",
                transform:
                  "translateX(-50%)",
                zIndex: 50,
                padding:
                  "10px 16px",
                borderRadius: 8,
                background:
                  "rgba(127,29,29,0.95)",
                color: "white",
                fontSize: 12,
              }}
            >
              {apiError}
            </div>
          )}

          {/* =================================================
              LOADING
          ================================================= */}

          {loading && (
            <div
              style={{
                position:
                  "absolute",
                left: "50%",
                top: "50%",
                transform:
                  "translate(-50%, -50%)",
                zIndex: 40,
                padding:
                  "12px 18px",
                borderRadius: 10,
                background:
                  "rgba(15,23,42,0.95)",
                color: "white",
                fontSize: 12,
              }}
            >
              Loading cadastral data...
            </div>
          )}

          {/* =================================================
              PROPERTY DETAILS PANEL
          ================================================= */}

          {selectedUnit && (
            <div className="property-details-panel">

              <div className="details-header">

                <div>

                  <div className="details-label">
                    VERTICAL PROPERTY ID
                  </div>

                  <div className="details-vpid">
                    {
                      selectedUnit.vertical_property_id
                    }
                  </div>

                </div>

                <button
                  type="button"
                  className="details-close"
                  onClick={
                    closeDetails
                  }
                >
                  ×
                </button>

              </div>

              {propertyDetailsLoading ? (
                <div
                  style={{
                    padding:
                      "20px 0",
                    textAlign:
                      "center",
                    color:
                      "#94a3b8",
                    fontSize: 12,
                  }}
                >
                  Loading property details...
                </div>
              ) : propertyDetails ? (
                <>

                  {/* =================================================
                      UNIT INFORMATION
                  ================================================= */}

                  <div className="details-grid">

                    <div className="detail-card">

                      <span>
                        UNIT
                      </span>

                      <strong>
                        U
                        {
                          propertyDetails
                            .unit
                            .number
                        }
                      </strong>

                    </div>

                    <div className="detail-card">

                      <span>
                        FLOOR
                      </span>

                      <strong>
                        {
                          propertyDetails
                            .unit
                            .floor_label
                        }
                      </strong>

                    </div>

                    <div className="detail-card">

                      <span>
                        AREA
                      </span>

                      <strong>
                        {
                          Number(
                            propertyDetails
                              .unit
                              .area_sq_m
                          ).toFixed(2)
                        }{" "}
                        m²
                      </strong>

                    </div>

                    <div className="detail-card">

                      <span>
                        HEIGHT
                      </span>

                      <strong>
                        {
                          propertyDetails
                            .unit
                            .min_z
                        }{" "}
                        –{" "}
                        {
                          propertyDetails
                            .unit
                            .max_z
                        }{" "}
                        m
                      </strong>

                    </div>

                  </div>

                  {/* =================================================
                      OWNERSHIP
                  ================================================= */}

                  <div className="details-section">

                    <div className="section-title">
                      OWNERSHIP
                    </div>

                    {propertyDetails.owner ? (
                      <div className="owner-row">

                        <strong>
                          {
                            propertyDetails
                              .owner
                              .name
                          }
                        </strong>

                        <span>
                          {
                            propertyDetails
                              .owner
                              .ownership_percentage
                          }
                          %
                        </span>

                      </div>
                    ) : (
                      <div className="owner-row">

                        <strong>
                          Not Assigned
                        </strong>

                      </div>
                    )}

                  </div>

                  {/* =================================================
                      PROPERTY TAX
                  ================================================= */}

                  <div className="details-section">

                    <div className="section-title">
                      PROPERTY TAX
                    </div>

                    {propertyDetails.tax ? (
                      <>

                        <div className="tax-row">

                          <span>
                            Assessment
                          </span>

                          <strong>
                            {formatMoney(
                              propertyDetails
                                .tax
                                .assessed_value
                            )}
                          </strong>

                        </div>

                        <div className="tax-row">

                          <span>
                            Tax Amount
                          </span>

                          <strong>
                            {formatMoney(
                              propertyDetails
                                .tax
                                .tax_amount
                            )}
                          </strong>

                        </div>

                        <div
                          className={
                            propertyDetails
                              .tax
                              .payment_status ===
                              "PAID"
                              ? "paid"
                              : "pending"
                          }
                        >
                          {
                            propertyDetails
                              .tax
                              .payment_status
                          }
                        </div>

                      </>
                    ) : (
                      <div className="parent-ulpin">
                        Tax information unavailable
                      </div>
                    )}

                  </div>

                  {/* =================================================
                      UTILITIES
                  ================================================= */}

                  <div className="details-section">

                    <div className="section-title">
                      UTILITIES
                    </div>

                    {propertyDetails.utilities
                      .length >
                      0 ? (
                      <div className="utilities-list">

                        {propertyDetails.utilities.map(
                          (
                            utility
                          ) => (
                            <div
                              className="utility-row"
                              key={
                                utility.connection_number
                              }
                            >

                              <span>
                                {
                                  utility.utility_type
                                }
                              </span>

                              <strong>
                                {
                                  utility.connection_number
                                }
                              </strong>

                            </div>
                          )
                        )}

                      </div>
                    ) : (
                      <div className="parent-ulpin">
                        No utility connections found
                      </div>
                    )}

                  </div>

                  {/* =================================================
                      PARENT ULPIN
                  ================================================= */}

                  <div className="panel-footer">
                    Parent ULPIN
                  </div>

                  <div className="parent-ulpin">
                    {
                      selectedUnit.parent_ulpin
                    }
                  </div>

                </>
              ) : (
                <div
                  style={{
                    padding:
                      "20px 0",
                    color:
                      "#94a3b8",
                    fontSize: 12,
                  }}
                >
                  Property details unavailable.
                </div>
              )}

            </div>
          )}

          {/* =================================================
              SELECTED PARCEL
          ================================================= */}

          {selectedParcel && (
            <div className="property-details-panel">

              <div className="details-header">

                <div>

                  <div className="details-label">
                    LAND PARCEL
                  </div>

                  <div className="details-vpid">
                    {
                      selectedParcel.ulpin
                    }
                  </div>

                </div>

                <button
                  type="button"
                  className="details-close"
                  onClick={() =>
                    setSelectedParcel(
                      null
                    )
                  }
                >
                  ×
                </button>

              </div>

              <div className="details-grid">

                <div className="detail-card">

                  <span>
                    ULPIN
                  </span>

                  <strong>
                    {
                      selectedParcel.ulpin
                    }
                  </strong>

                </div>

                <div className="detail-card">

                  <span>
                    PARCEL
                  </span>

                  <strong>
                    {
                      selectedParcel
                        .parcel_number ??
                      "N/A"
                    }
                  </strong>

                </div>

                <div className="detail-card">

                  <span>
                    AREA
                  </span>

                  <strong>
                    {
                      selectedParcel
                        .area_sq_m ??
                      "N/A"
                    }{" "}
                    m²
                  </strong>

                </div>

                <div className="detail-card">

                  <span>
                    ELEVATION
                  </span>

                  <strong>
                    {
                      selectedParcel
                        .base_elevation_m ??
                      "N/A"
                    }{" "}
                    m
                  </strong>

                </div>

              </div>

              <div className="details-section">

                <div className="section-title">
                  GEOMETRY
                </div>

                <div className="owner-row">

                  <strong>
                    {
                      selectedParcel.geometry
                        ? "3D Polygon"
                        : "Not Available"
                    }
                  </strong>

                </div>

              </div>

              <div className="panel-footer">
                Parent ULPIN
              </div>

              <div className="parent-ulpin">
                {
                  selectedParcel.ulpin
                }
              </div>

            </div>
          )}

          {/* =================================================
              MAP BADGE
          ================================================= */}

          <div className="map-badge">

            <span className="live-dot" />

            3D CADASTRAL VIEW

          </div>

        </main>

      </div>

      <GenerateBuildingModal
        open={generateBuildingOpen}
        parcels={parcels}
        selectedParcel={selectedParcel}
        onClose={() =>
          setGenerateBuildingOpen(false)
        }
        onGenerated={
          handleBuildingGenerated
        }
      />

    </div>
  );
}

export default App;