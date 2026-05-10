import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import VotePage from "./pages/VotePage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminControl from "./pages/AdminControl";
import AdminGate from "./components/AdminGate";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/vote" replace />} />
        <Route path="/vote" element={<VotePage />} />
        <Route
          path="/admin"
          element={
            <AdminGate>
              <AdminDashboard />
            </AdminGate>
          }
        />
        <Route
          path="/admin/control"
          element={
            <AdminGate>
              <AdminControl />
            </AdminGate>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
