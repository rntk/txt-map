import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/design-tokens.css";
import "./styles/foundation.css";
// Import shared feature surfaces after the shell so scoped feature classes can
// deliberately refine the base without adding selector specificity hacks.
import "./styles/App.css";
import "./styles/chart-surfaces.css";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
