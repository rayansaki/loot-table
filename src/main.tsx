import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startAnalytics } from "./analytics";
import App from "./App";
import { routeExternalLinks } from "./external";
import "./styles.css";
import { initSync } from "./sync";

routeExternalLinks();
startAnalytics();

// Your own server's copy of the list first, if there is one (sync.ts)
void initSync().finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
