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

import {
  getAuthUser,
} from "./services/authService";

import "./index.css";

/*
|--------------------------------------------------------------------------
| ROLE-BASED DASHBOARD ENTRY
|--------------------------------------------------------------------------
|
| The /dashboard route remains the main protected entry point.
|
| Government Officers are sent to the government administration dashboard.
|
| Citizens, Surveyors and Admins currently continue to the existing
| 3D ULPIN dashboard until their dedicated dashboards are implemented.
|
|--------------------------------------------------------------------------
*/

function DashboardEntry() {
  const user = getAuthUser();

  if (
    user?.role ===
    "GOVERNMENT_OFFICER"
  ) {
    return (
      <GovernmentOfficerDashboard />
    );
  }

  return <App />;
}

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <BrowserRouter>

      <Routes>

        {/* ============================================================
            PUBLIC ROUTES
            ============================================================ */}

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        {/* ============================================================
            PROTECTED APPLICATION
            ============================================================ */}

        <Route
          element={
            <ProtectedRoute />
          }
        >

          {/* Main dashboard */}
          <Route
            path="/dashboard"
            element={
              <DashboardEntry />
            }
          />

          {/* Explicit Government Officer dashboard */}
          <Route
            path="/government-dashboard"
            element={
              <GovernmentOfficerDashboard />
            }
          />

          {/* Existing building editor */}
          <Route
            path="/edit-building"
            element={
              <EditExistingBuilding />
            }
          />

        </Route>

        {/* ============================================================
            DEFAULT ROUTE
            ============================================================ */}

        <Route
          path="/"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

        {/* ============================================================
            UNKNOWN ROUTES
            ============================================================ */}

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