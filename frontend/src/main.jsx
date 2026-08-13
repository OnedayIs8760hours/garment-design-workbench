import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

// 将 React 应用挂载到 Vite 页面里的根节点。
createRoot(document.getElementById("root")).render(<App />);
