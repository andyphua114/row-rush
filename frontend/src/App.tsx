import { useEffect } from "react";
import { AdminPage } from "./pages/AdminPage";
import { GlobalAdminPage } from "./pages/GlobalAdminPage";
import { PlayerPage } from "./pages/PlayerPage";
import { ProjectorPage } from "./pages/ProjectorPage";
import { RoomSetupPage } from "./pages/RoomSetupPage";

export function App() {
  const path = window.location.pathname;
  const roomMatch = path.match(/^\/r\/([^/]+)(?:\/(admin|projector))?\/?$/);
  const roomId = roomMatch?.[1] ?? "";
  const roomView = roomMatch?.[2] ?? "player";
  const title = path.startsWith("/globaladmin")
    ? "Row Rush Global Admin"
    : roomView === "admin"
      ? "Row Rush Room Admin"
      : roomView === "projector"
        ? "Row Rush Projector"
        : "Row Rush";

  useEffect(() => {
    document.title = title;
  }, [title]);

  if (path.startsWith("/globaladmin")) return <GlobalAdminPage />;
  if (roomMatch && roomView === "admin") return <AdminPage roomId={roomId} />;
  if (roomMatch && roomView === "projector") return <ProjectorPage roomId={roomId} />;
  if (roomMatch) return <PlayerPage roomId={roomId} />;
  return <RoomSetupPage />;
}
