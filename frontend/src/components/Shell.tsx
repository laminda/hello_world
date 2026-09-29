import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

const SIDE = [
  { to: "/", label: "Поиск людей", icon: "search", end: true },
  { to: "/projects", label: "Проекты", icon: "folder" },
  { to: "/results", label: "Результаты", icon: "list" },
  { to: "/graph", label: "Граф связей", icon: "graph" },
  { to: "/docs", label: "Документы", icon: "doc" },
  { to: "/images", label: "Изображения", icon: "image" },
  { to: "/archive", label: "Архив сайтов", icon: "archive" },
  { to: "/social", label: "Социальные сети", icon: "share" },
  { to: "/video", label: "Видео и медиа", icon: "video" },
  { to: "/tools", label: "Инструменты (API)", icon: "grid" },
  { to: "/playbooks", label: "Плейбуки", icon: "book" },
  { to: "/reports", label: "Отчёты", icon: "report" },
  { to: "/export", label: "Экспорт", icon: "export" },
];

function Ico({ name }: { name: string }) {
  const p = { width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "search":
      return (
        <svg {...p}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M12.5 12.5 16 16" />
        </svg>
      );
    case "folder":
      return (
        <svg {...p}>
          <path d="M3 6.5h5l1.5 2H15a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case "list":
      return (
        <svg {...p}>
          <path d="M4 6h10M4 9.5h10M4 13h7" />
        </svg>
      );
    case "graph":
      return (
        <svg {...p}>
          <circle cx="5" cy="13" r="2" />
          <circle cx="13" cy="5" r="2" />
          <circle cx="14" cy="13" r="2" />
          <path d="M6.7 11.5 11.4 6.6M7 13h5" />
        </svg>
      );
    case "doc":
      return (
        <svg {...p}>
          <path d="M6 3.5h5l4 4V15a1.5 1.5 0 0 1-1.5 1.5h-7.5A1.5 1.5 0 0 1 4.5 15V5A1.5 1.5 0 0 1 6 3.5Z" />
          <path d="M11 3.5V8h4" />
        </svg>
      );
    case "image":
      return (
        <svg {...p}>
          <rect x="3.5" y="4.5" width="11" height="9" rx="1.4" />
          <circle cx="7" cy="8" r="1" />
          <path d="M3.8 12.2 7.2 9.6 10 12l2.4-2.2 1.8 2.2" />
        </svg>
      );
    case "archive":
      return (
        <svg {...p}>
          <path d="M3.5 5.5h11v2h-11zM5 7.5v7h8v-7" />
        </svg>
      );
    case "share":
      return (
        <svg {...p}>
          <circle cx="5" cy="9" r="1.7" />
          <circle cx="13" cy="5" r="1.7" />
          <circle cx="13" cy="13" r="1.7" />
          <path d="M6.6 8.2 11.4 5.8M6.6 9.8 11.4 12.2" />
        </svg>
      );
    case "video":
      return (
        <svg {...p}>
          <rect x="3.5" y="5.5" width="8" height="7" rx="1.2" />
          <path d="M11.5 8.2 15 6.5v7l-3.5-1.7Z" />
        </svg>
      );
    case "grid":
      return (
        <svg {...p}>
          <rect x="3.5" y="3.5" width="4.2" height="4.2" rx="0.8" />
          <rect x="10.3" y="3.5" width="4.2" height="4.2" rx="0.8" />
          <rect x="3.5" y="10.3" width="4.2" height="4.2" rx="0.8" />
          <rect x="10.3" y="10.3" width="4.2" height="4.2" rx="0.8" />
        </svg>
      );
    case "book":
      return (
        <svg {...p}>
          <path d="M4 4.5h5a3 3 0 0 1 3 3v8H7a3 3 0 0 0-3 3Z" />
          <path d="M14 4.5H9" />
        </svg>
      );
    case "report":
      return (
        <svg {...p}>
          <path d="M5 15V8M9 15V5M13 15v-4" />
        </svg>
      );
    case "export":
      return (
        <svg {...p}>
          <path d="M9 3.5v8M6 6.5 9 3.5 12 6.5M4.5 12.5v2h9v-2" />
        </svg>
      );
    case "gear":
      return (
        <svg {...p}>
          <circle cx="9" cy="9" r="2.2" />
          <path d="M9 3.4v1.6M9 13v1.6M3.4 9h1.6M13 9h1.6M5 5l1.1 1.1M11.9 11.9 13 13M13 5l-1.1 1.1M5 13l1.1-1.1" />
        </svg>
      );
    default:
      return <span />;
  }
}

function lastInv() {
  try {
    return sessionStorage.getItem("svod.lastInv") || "";
  } catch {
    return "";
  }
}

export default function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const inv = lastInv();
  const resolve = (to: string) => {
    if (["/results", "/graph", "/docs", "/images", "/archive", "/social", "/video", "/reports", "/export"].includes(to)) {
      return inv ? `/inv/${inv}${to === "/results" ? "" : `?tab=${to.slice(1)}`}` : "/";
    }
    if (to === "/playbooks") return "/tools";
    return to;
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="side-brand">
          <img src="/logo.png" alt="" />
          <span>
            <b>OSINT Platform</b>
            <small>Person Intelligence</small>
          </span>
        </Link>
        <nav className="side-nav">
          {SIDE.map((s) => {
            const href = resolve(s.to);
            const on =
              s.to === "/"
                ? loc.pathname === "/"
                : s.to === "/projects"
                  ? loc.pathname === "/projects"
                  : s.to === "/tools" || s.to === "/playbooks"
                    ? loc.pathname === "/tools"
                    : loc.pathname.startsWith("/inv") && (s.to === "/results" || loc.search.includes(`tab=${s.to.slice(1)}`));
            return (
              <NavLink key={s.to} to={href} className={on ? "on" : ""}>
                <Ico name={s.icon} />
                {s.label}
              </NavLink>
            );
          })}
        </nav>
        <Link to="/settings" className={`side-foot ${loc.pathname === "/settings" ? "on" : ""}`}>
          <Ico name="gear" /> Настройки
        </Link>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <div className="top-search">
            <Ico name="search" />
            <input placeholder="Поиск человека, компании, должности…" readOnly onFocus={() => (window.location.href = "/")} />
          </div>
          <nav className="top-links">
            <Link to="/projects">Проекты</Link>
            <Link to="/tools">Инструменты</Link>
            <Link to="/settings">Настройки</Link>
            <span className="avatar-mini">A</span>
          </nav>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
