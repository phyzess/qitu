import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
