import { AdminPage } from "./pages/AdminPage";
import { PlayerPage } from "./pages/PlayerPage";
import { ProjectorPage } from "./pages/ProjectorPage";

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <AdminPage />;
  if (path.startsWith("/projector")) return <ProjectorPage />;
  return <PlayerPage />;
}
