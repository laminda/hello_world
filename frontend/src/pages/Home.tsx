import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createInvestigation, startInvestigation } from "../api";
import SearchPanel from "../components/SearchPanel";

export default function Home() {
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const onSearch = async (form: Record<string, string>) => {
    setBusy(true);
    try {
      const created = await createInvestigation(form);
      try {
        sessionStorage.setItem("svod.lastInv", created.id);
      } catch {
        /* */
      }
      await startInvestigation(created.id);
      nav(`/inv/${created.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page pi-home">
      <SearchPanel busy={busy} onSearch={onSearch} />
    </div>
  );
}
