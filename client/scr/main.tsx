import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";

window.addEventListener("error", (e) => {
  if (e.target instanceof HTMLAudioElement || e.target instanceof HTMLVideoElement) {
    e.stopImmediatePropagation();
  }
}, true);

window.addEventListener("unhandledrejection", (e) => {
  if (e.reason && typeof e.reason === "object" && e.reason.constructor && e.reason.constructor.name === "DOMException") {
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
