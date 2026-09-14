import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import App from "./App";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./ProtectedRoute";
import EditExistingBuilding from "./components/EditExistingBuilding";
import GovernmentOfficerDashboard from "./pages/GovernmentOfficerDashboard";
import CitizenDashboard from "./pages/CitizenDashboard";
import SurveyorDashboard from "./pages/SurveyorDashboard";

import { getAuthUser } from "./services/authService";

import "./index.css";

/* =========================================================
   DASHBOARD ENTRY

   Decides which dashboard should open at /dashboard
   according to the logged-in user's role.
========================================================= */

function DashboardEntry() {
  const user = getAuthUser();

  /*
   * =======================================================
   * SURVEYOR
   *
   * Surveyors should land on the Surveyor Dashboard.
   * =======================================================
   */

  if (
    user?.role === "SURVEYOR"
  ) {
    return (
      <SurveyorDashboard />
    );
  }

  /*
   * =======================================================
   * GOVERNMENT OFFICER
   * =======================================================
   */

  if (
    user?.role ===
    "GOVERNMENT_OFFICER"
  ) {
    return (
      <GovernmentOfficerDashboard />
    );
  }

  /*
   * =======================================================
   * CITIZEN
   * =======================================================
   *
   * Citizen normally lands on the Citizen Property Portal.
   *
   * When the Citizen Portal sends:
   *
   * /dashboard?vpid=12345678901236-B05-F01-U101
   *
   * open the existing Cesium 3D Explorer instead.
   * =======================================================
   */

  if (
    user?.role === "CITIZEN"
  ) {
    const hasVpidDeepLink =
      new URLSearchParams(
        window.location.search
      ).has("vpid");

    if (hasVpidDeepLink) {
      return <App />;
    }

    return (
      <CitizenDashboard />
    );
  }

  /*
   * =======================================================
   * DEFAULT
   * =======================================================
   */

  return <App />;
}

/* =========================================================
   APPLICATION
========================================================= */

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <BrowserRouter>

      <Routes>

        {/* =================================================
            PUBLIC ROUTES
        ================================================= */}

        <Route
          path="/login"
          element={
            <Login />
          }
        />

        <Route
          path="/register"
          element={
            <Register />
          }
        />

        {/* =================================================
            PROTECTED ROUTES
        ================================================= */}

        <Route
          element={
            <ProtectedRoute />
          }
        >

          {/* =================================================
              ROLE-BASED MAIN DASHBOARD
          ================================================= */}

          <Route
            path="/dashboard"
            element={
              <DashboardEntry />
            }
          />

          {/* =================================================
              GOVERNMENT OFFICER DASHBOARD
          ================================================= */}

          <Route
            path="/government-dashboard"
            element={
              <GovernmentOfficerDashboard />
            }
          />

          {/* =================================================
              SURVEYOR DASHBOARD
          ================================================= */}

          <Route
            path="/surveyor"
            element={
              <SurveyorDashboard />
            }
          />

          {/* =================================================
              EDIT EXISTING BUILDING
          ================================================= */}

          <Route
            path="/edit-building"
            element={
              <EditExistingBuilding />
            }
          />

        </Route>

        {/* =================================================
            ROOT
        ================================================= */}

        <Route
          path="/"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

        {/* =================================================
            UNKNOWN ROUTES
        ================================================= */}

        <Route
          path="*"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

      </Routes>

    </BrowserRouter>
  </React.StrictMode>
);