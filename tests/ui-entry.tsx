import React from "react";
import { createRoot } from "react-dom/client";
import { ParticipantDashboard } from "../src/components/participant-dashboard";
import { DeveloperDashboard } from "../src/components/developer-dashboard";
const section =
  new URLSearchParams(location.search).get("section") || "overview";
createRoot(document.getElementById("root")!).render(
  location.pathname.includes("developer") ? (
    <DeveloperDashboard section={section} />
  ) : (
    <ParticipantDashboard />
  ),
);
