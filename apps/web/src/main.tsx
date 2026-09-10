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
import { getAuthUser } from "./services/authService";
import "./index.css";

function DashboardEntry() {
  const user = getAuthUser();

  /*
   * Citizen normally lands on the Citizen Property Portal.
   *
   * When the Citizen Portal sends:
   *
   * /dashboard?vpid=12345678901236-B05-F01-U101
   *
   * open the existing Cesium 3D Explorer instead.
   */
  const hasVpidDeepLink =
    new URLSearchParams(window.location.search).has("vpid");

  if (user?.role === "GOVERNMENT_OFFICER") {
    return <GovernmentOfficerDashboard />;
  }

  if (user?.role === "CITIZEN") {
    if (hasVpidDeepLink) {
      return <App />;
    }

    return <CitizenDashboard />;
  }

  return <App />;
}

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        <Route element={<ProtectedRoute />}>
          <Route
            path="/dashboard"
            element={<DashboardEntry />}
          />

          <Route
            path="/government-dashboard"
            element={
              <GovernmentOfficerDashboard />
            }
          />

          <Route
            path="/edit-building"
            element={
              <EditExistingBuilding />
            }
          />
        </Route>

        <Route
          path="/"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

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
