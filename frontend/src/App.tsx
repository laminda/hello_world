import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import NewInvestigation from "./pages/NewInvestigation";
import Investigation from "./pages/Investigation";

export default function App() {
  const loc = useLocation();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ color: "inherit" }}>
          <span>SVOD</span>
          <small>EVIDENCE INTELLIGENCE</small>
        </Link>
        <nav className="tabs" style={{ marginLeft: 8 }}>
          <Link to="/">
            <button className={loc.pathname === "/" ? "on" : ""}>Досье</button>
          </Link>
          <Link to="/new">
            <button className={loc.pathname === "/new" ? "on" : ""}>Новое расследование</button>
          </Link>
        </nav>
        <div className="meta">
          <span>PUBLIC SOURCES ONLY</span>
          <span className="role-chip">ANALYST · RBAC</span>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewInvestigation />} />
        <Route path="/inv/:id" element={<Investigation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
