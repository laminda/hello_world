import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createInvestigation, startInvestigation } from "../api";

const FIELDS = [
  ["name", "Имя"],
  ["middle_name", "Отчество"],
  ["last_name", "Фамилия"],
  ["position", "Должность"],
  ["organization", "Организация"],
  ["city", "Город"],
  ["birth_year", "Год рождения"],
  ["email", "E-mail"],
  ["phone", "Телефон"],
  ["username", "Username"],
  ["url", "URL"],
  ["inn", "ИНН (только публичный/законный источник)"],
];

export default function NewInvestigation() {
  const [form, setForm] = useState<Record<string, string>>({
    name: "Фёдор",
    middle_name: "Михайлович",
    position: "заместитель директора",
    organization: "Компания X",
    city: "Москва",
  });
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await createInvestigation(form);
      await startInvestigation(created.id);
      nav(`/inv/${created.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="kicker">New investigation</div>
      <h1 style={{ marginBottom: 16 }}>Исходные данные</h1>
      <p className="lede muted" style={{ maxWidth: 640, marginBottom: 16 }}>
        Поля могут быть неизвестны. Планировщик построит поисковые стратегии по тому, что есть, и
        начнёт цикл: search → sources → extraction → graph. Живой поиск идёт только по открытым
        источникам (Wikipedia, Wikidata, DuckDuckGo, Wayback) с соблюдением robots.txt.
      </p>
      <form className="card form" onSubmit={onSubmit} style={{ maxWidth: 760 }}>
        {FIELDS.map(([k, label]) => (
          <label key={k}>
            {label}
            <input
              value={form[k] ?? ""}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </label>
        ))}
        <label className="wide">
          Заметки
          <textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => nav("/")}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Создание…" : "Запустить агента"}
          </button>
        </div>
      </form>
    </div>
  );
}
