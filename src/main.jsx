import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// PWA service worker registration (vite-plugin-pwa)
registerSW({
  onOfflineReady() {
    console.log("[PWA] Offline ready");
  },
  onNeedRefresh() {
    console.log("[PWA] New content available — refresh to update");
  },
  onRegistered(r) {
    console.log("[PWA] Service worker registered", r);
  },
  onRegisterError(error) {
    console.error("[PWA] Service worker registration error", error);
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
