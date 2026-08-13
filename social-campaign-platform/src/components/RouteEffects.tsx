import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const routeTitles: Record<string, string> = {
  "/": "CampaignHub – Social Campaign Management",
  "/dashboard": "Dashboard – CampaignHub",
  "/campaigns": "Kampagnen – CampaignHub",
  "/social-stream": "Social Stream – CampaignHub",
  "/media-library": "Mediathek – CampaignHub",
  "/tasks": "Aufgaben – CampaignHub",
  "/agents": "Agent Workflows – CampaignHub",
  "/participants": "Beteiligte – CampaignHub",
  "/profile": "Profil – CampaignHub",
  "/admin": "Admin – CampaignHub",
};

export default function RouteEffects() {
  const location = useLocation();
  const basePath = location.pathname.startsWith("/campaigns/")
    ? "/campaigns"
    : location.pathname;
  const pageTitle =
    routeTitles[basePath] ?? "Seite nicht gefunden – CampaignHub";

  useEffect(() => {
    document.title = pageTitle;
    window.scrollTo({ top: 0, left: 0 });
    window.requestAnimationFrame(() => {
      const main = document.getElementById("main-content");
      if (main) {
        main.tabIndex = -1;
        main.focus({ preventScroll: true });
      }
    });
  }, [location.pathname, pageTitle]);

  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {pageTitle}
    </span>
  );
}
