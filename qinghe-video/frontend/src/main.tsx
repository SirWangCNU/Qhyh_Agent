import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// 加载本地字体（登录页与品牌展示页使用）
import "@fontsource/instrument-serif/400.css";
import "@fontsource/geist/100.css";
import "@fontsource/geist/200.css";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist/800.css";
import "@fontsource/geist/900.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
