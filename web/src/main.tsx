import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initialTheme, ThemeProvider } from "./lib/theme";

// Set the theme before the first paint, so there's no flash of the wrong colours.
document.documentElement.dataset.theme = initialTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {/* honour the visitor's "reduce motion" setting for every Motion animation */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
