import { FormEvent, useEffect, useState } from "react";
import { getCatalog, setCatalogEnabled, type CatalogRow } from "../api";

const TABS = [
  ["name", "ФИО"],
  ["organization", "Компания"],
  ["position", "Должность"],
  ["email", "Email"],
  ["phone", "Телефон"],
  ["username", "Username"],
] as const;

const MORE = [
  ["last_name", "Фамилия"],
  ["middle_name", "Отчество"],
  ["url", "URL"],
  ["inn", "ИНН (законный публичный)"],
  ["notes", "Заметки"],
] as const;

const STRATEGY: Record<string, string[]> = {
  public_top_manager: [
    "Поиск по официальному сайту компании",
    "Анализ годовых отчётов и PDF-документов",
    "Поиск в СМИ и деловых изданиях",
    "Публичные сниппеты соцсетей (без логина)",
    "Интервью и выступления",
    "Архивные версии сайтов",
    "Документы и презентации",
  ],
  middle_manager: [
    "Поиск по официальному сайту компании",
    "Списки спикеров / конференции",
    "PDF staff lists и отчёты",
    "Habr / GitHub / публичные профили",
    "Архивные версии сайтов",
  ],
  low_level_employee: [
    "site: компании + имя",
    "PDF / CV, если опубликованы",
    "Username / email как гипотезы",
    "Без people-search баз",
  ],
  unknown: [
    "Playbook PERSON_FROM_* по известным полям",
    "Узкие публичные dorks",
    "Не считать упоминание идентификацией",
  ],
};

function guessType(form: Record<string, string>) {
  const p = (form.position || "").toLowerCase();
  if (/генеральн|ceo|президент|основател/.test(p)) return "public_top_manager";
  if (/директор|руководитель|начальник|заместитель|head of|cfo|cto/.test(p)) return "middle_manager";
  if (form.username && !form.position) return "low_level_employee";
  if (form.position) return "low_level_employee";
  return "unknown";
}

const TYPE_LABEL: Record<string, string> = {
  public_top_manager: "Топ-менеджер (компания)",
  middle_manager: "Средний менеджмент",
  low_level_employee: "Низкая публичность",
  unknown: "Недостаточно данных",
};

export default function SearchPanel({
  initial,
  busy,
  onSearch,
}: {
  initial?: Record<string, string>;
  busy?: boolean;
  onSearch: (form: Record<string, string>) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    name: initial?.name || "",
    last_name: initial?.last_name || "",
    middle_name: initial?.middle_name || "",
    organization: initial?.organization || "",
    position: initial?.position || "",
    city: initial?.city || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    username: initial?.username || "",
    url: initial?.url || "",
    inn: initial?.inn || "",
    notes: initial?.notes || "",
  });
  const [mode, setMode] = useState<"quick" | "advanced">("quick");
  const [field, setField] = useState("name");
  const [more, setMore] = useState(false);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);

  useEffect(() => {
    getCatalog()
      .then((d) => setCatalog(d.catalog || []))
      .catch(() => setCatalog([]));
  }, []);

  const t = guessType(form);
  const steps = STRATEGY[t] || STRATEGY.unknown;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(form);
  };

  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  return (
    <form className="search-board" onSubmit={submit}>
      <div className="card search-card">
        <div className="card-h">
          <span className="dot" /> Новый поиск
        </div>
        <div className="seg">
          <button type="button" className={mode === "quick" ? "on" : ""} onClick={() => setMode("quick")}>
            Быстрый поиск
          </button>
          <button type="button" className={mode === "advanced" ? "on" : ""} onClick={() => setMode("advanced")}>
            Расширенный режим
          </button>
        </div>
        <div className="field-tabs">
          {TABS.map(([k, l]) => (
            <button type="button" key={k} className={field === k ? "on" : ""} onClick={() => setField(k)}>
              {l}
            </button>
          ))}
          <button type="button" className={more ? "on" : ""} onClick={() => setMore(!more)}>
            Ещё ▾
          </button>
        </div>
        <div className="search-grid">
          <label>
            Имя / Фамилия
            <div className="duo">
              <input placeholder="Имя" value={form.name} onChange={(e) => set("name", e.target.value)} />
              <input placeholder="Фамилия" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </label>
          <label>
            Компания
            <input placeholder="Магнит" value={form.organization} onChange={(e) => set("organization", e.target.value)} />
          </label>
          <label>
            Должность
            <input placeholder="Директор внутреннего аудита" value={form.position} onChange={(e) => set("position", e.target.value)} />
          </label>
          <label>
            Город (опционально)
            <input placeholder="Москва" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </label>
        </div>
        {(mode === "advanced" || more) && (
          <div className="search-grid">
            {MORE.map(([k, l]) =>
              k === "last_name" ? null : (
                <label key={k}>
                  {l}
                  <input value={form[k] || ""} onChange={(e) => set(k, e.target.value)} />
                </label>
              )
            )}
            {TABS.filter(([k]) => !["name", "organization", "position"].includes(k)).map(([k, l]) => (
              <label key={k}>
                {l}
                <input value={form[k] || ""} onChange={(e) => set(k, e.target.value)} />
              </label>
            ))}
          </div>
        )}
        <div className="search-actions">
          <button className="btn primary lg" disabled={busy}>
            {busy ? "Идёт поиск…" : "Начать поиск"}
          </button>
        </div>
      </div>

      <div className="card strat-card">
        <div className="card-h">Стратегия поиска <span className="muted small">(выбрана ИИ)</span></div>
        <div className="strat-type">
          <i /> {TYPE_LABEL[t]}
        </div>
        <p className="tiny muted">Выбрана на основе введённых данных. Упоминание ≠ идентификация.</p>
        <ul className="checks">
          {steps.map((s) => (
            <li key={s}>
              <input type="checkbox" checked readOnly /> {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="card src-card">
        <div className="card-h">
          Источники поиска
          <a className="tiny" href="/catalog">
            Настроить
          </a>
        </div>
        <div className="src-list">
          {(catalog.length ? catalog : []).slice(0, 9).map((c) => (
            <label key={c.source_id} className="src-row">
              <span className="src-ico">{(c.name || c.source_id).slice(0, 1)}</span>
              <span className="grow">
                <b>{c.name}</b>
                <small>{c.type}</small>
              </span>
              <input
                type="checkbox"
                checked={c.enabled !== 0}
                onChange={async (e) => {
                  await setCatalogEnabled(c.source_id, e.target.checked);
                  const d = await getCatalog();
                  setCatalog(d.catalog || []);
                }}
              />
            </label>
          ))}
          {!catalog.length && <p className="tiny muted">Каталог загружается…</p>}
        </div>
      </div>
    </form>
  );
}
