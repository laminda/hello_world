import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import Home from "./pages/Home";
import Investigation from "./pages/Investigation";
import SourcesAdmin from "./pages/SourcesAdmin";
import Tools from "./pages/Tools";
import Settings from "./pages/Settings";
import Projects from "./pages/Projects";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<Navigate to="/" replace />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/catalog" element={<SourcesAdmin />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/inv/:id" element={<Investigation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
