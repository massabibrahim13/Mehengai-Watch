import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initialTheme, ThemeProvider } from "./lib/theme";

// Set the theme before the first paint, so there's no flash of the wrong colours (index.html does this too, for the
// loading screen; this keeps the dev server and the app's own rule in charge).
document.documentElement.dataset.theme = initialTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {/* honour the visitor's "reduce motion" setting for every Motion animation */}
      <MotionConfig reducedMotion="user">
        {/* only the animation features the site uses (fades, slides, exits), not all of Motion; `strict` turns any
            full-size `motion.` component into an error, so the small `m.` form is used everywhere */}
        <LazyMotion features={domAnimation} strict>
          <App />
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
