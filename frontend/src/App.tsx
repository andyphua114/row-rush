import { useEffect } from "react";
import { AdminPage } from "./pages/AdminPage";
import { PlayerPage } from "./pages/PlayerPage";
import { ProjectorPage } from "./pages/ProjectorPage";

export function App() {
  const path = window.location.pathname;
  const title = path.startsWith("/admin")
    ? "Row Rush Admin"
    : path.startsWith("/projector")
      ? "Row Rush Projector"
      : "Row Rush";

  useEffect(() => {
    document.title = title;
  }, [title]);

  if (path.startsWith("/admin")) return <AdminPage />;
  if (path.startsWith("/projector")) return <ProjectorPage />;
  return <PlayerPage />;
}
