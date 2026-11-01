import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { themeController } from "./useTheme";
// The same Figma Make families, bundled locally for offline English/Turkish UI.
import "@fontsource/bricolage-grotesque/latin-400.css";
import "@fontsource/bricolage-grotesque/latin-ext-400.css";
import "@fontsource/bricolage-grotesque/latin-500.css";
import "@fontsource/bricolage-grotesque/latin-ext-500.css";
import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-ext-600.css";
import "@fontsource/bricolage-grotesque/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-ext-700.css";
import "@fontsource/fraunces/latin-500-italic.css";
import "@fontsource/fraunces/latin-ext-500-italic.css";
import "@fontsource/gabarito/latin-700.css";
import "@fontsource/gabarito/latin-ext-700.css";
import "@fontsource/fredoka/latin-500.css";
import "@fontsource/fredoka/latin-ext-500.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/fredoka/latin-ext-600.css";

// Light/Dark/System: follow the device from the first screen on (index.html has
// already applied the saved theme before this script ran).
themeController();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
