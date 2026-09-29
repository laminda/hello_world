import { resolve4, resolveMx, resolveTxt } from "node:dns/promises";
import { httpGet } from "../../search.js";
import { fail, ok, type Methodology, type ToolModule } from "../types.js";

function host(raw: string) {
  return (raw || "").replace(/^https?:\/\//, "").split("/")[0];
}

const dns: ToolModule = {
  meta: {
    name: "dns_lookup",
    module: "network",
    family: "network",
    description: "Public DNS A/MX/TXT for an organization domain.",
    parameters: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] },
    legal: "Public DNS. Not a port scan, not exploitation.",
    cost: 0.08,
    when: "domain from email or website",
  },
  async execute(args) {
    const domain = host(args.domain || "");
    const out: Record<string, string[]> = {};
    try {
      out.A = await resolve4(domain);
    } catch {
      out.A = [];
    }
    try {
      out.MX = (await resolveMx(domain)).map((m) => `${m.priority} ${m.exchange}`);
    } catch {
      out.MX = [];
    }
    try {
      out.TXT = (await resolveTxt(domain)).map((t) => t.join(""));
    } catch {
      out.TXT = [];
    }
    return ok(`DNS ${domain} A=${out.A.length} MX=${out.MX.length}`, { data: { domain, ...out } });
  },
};

const rdap: ToolModule = {
  meta: {
    name: "rdap_lookup",
    module: "network",
    family: "network",
    description: "RDAP public registration data for a domain.",
    parameters: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] },
    legal: "Public RDAP. Privacy-redacted fields stay redacted.",
    cost: 0.12,
    when: "need registrar / org name for a domain",
  },
  async execute(args) {
    const domain = host(args.domain || "");
    const res = await httpGet(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { accept: "application/rdap+json" });
    if (!res.ok) return fail("RDAP fetch failed (TLS/network or unknown domain)");
    let json: unknown = res.text;
    try {
      json = JSON.parse(res.text);
    } catch {
      /* raw */
    }
    return ok(`RDAP ${domain}`, { data: { rdap: json } });
  },
};

const ct: ToolModule = {
  meta: {
    name: "cert_transparency",
    module: "network",
    family: "network",
    description: "Certificate Transparency (crt.sh) — public hostnames for a domain.",
    parameters: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] },
    legal: "Public CT logs. Issued certificates are public.",
    cost: 0.15,
    when: "find related hosts of the company",
  },
  async execute(args) {
    const domain = args.domain || "";
    const res = await httpGet(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, { accept: "application/json" });
    if (!res.ok) return fail("crt.sh fetch failed");
    try {
      const rows = JSON.parse(res.text) as Array<{ name_value?: string }>;
      const names = [...new Set(rows.flatMap((r) => (r.name_value || "").split("\n")))].slice(0, 40);
      return ok(`${names.length} CT names`, { data: { names } });
    } catch {
      return fail("crt.sh parse failed");
    }
  },
};

export const methodology: Methodology = {
  id: "network",
  title: "DNS / RDAP / CT",
  description: "Публичная сетевая разведка домена. Не сканер портов.",
  version: "1.0",
  tools: [dns, rdap, ct],
};
