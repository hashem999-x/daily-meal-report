// Report formatting — client- and server-safe. Given the day's entries plus
// user-configured format settings, produces the Arabic and English WhatsApp
// report strings.

export type Entry = {
  branch_id: string;
  name_ar: string;
  name_en: string;
  evm3_units: number;
  cheese_units: number;
};

export type PositionCfg = { name: string; emoji: string };
export type PositionCfgV2 = {
  name: string;
  emoji: string;
  spaces_after_name?: number;
  spaces_after_emoji?: number;
  spaces_after_rank?: number;
  spaces_after_arrow?: number;
};

export type ArFormat = {
  title_ar: string;
  large_meal_label: string;
  cheese_label: string;
  best_evm3_label: string;
  best_cheese_label: string;
  best_evm3_spaces?: number;
  best_cheese_spaces?: number;
  positions: PositionCfgV2[];
  arrow: string;
  spaces_before_arrow: number;
  spaces_after_arrow: number;
  header_emojis: string;
  cheese_emojis: string;
  meal_emojis: string;
  branch_name_spaces?: Record<string, number>;
};

export type EnFormat = {
  greeting: string;
  intro: string;
  best_evm3_label: string;
  best_cheese_label: string;
  closing: string;
  meal_header: string;
  cheese_header: string;
  positions: PositionCfgV2[];
  arrow: string;
  spaces_before_arrow: number;
  spaces_after_arrow: number;
  branch_name_spaces?: Record<string, number>;
};

export type ReportSettings = { ar_format: ArFormat; en_format: EnFormat };

function spaces(n: number): string {
  return " ".repeat(Math.max(0, n | 0));
}

function rank<T>(items: T[], key: (i: T) => number): T[] {
  return [...items].sort((a, b) => key(b) - key(a));
}

function line(
  pos: PositionCfgV2,
  name: string,
  value: number,
  cfg: { arrow: string; spaces_before_arrow: number; spaces_after_arrow: number },
  isTop: boolean,
  afterNameSpaces: number,
): string {
  const afterEmoji = spaces(pos.spaces_after_emoji ?? 1);
  const afterRank = spaces(pos.spaces_after_rank ?? cfg.spaces_before_arrow);
  const afterArrow = spaces(pos.spaces_after_arrow ?? cfg.spaces_after_arrow);
  const afterName = spaces(afterNameSpaces);
  const valueText = `(*${value}*)`;
return `${pos.emoji}${afterEmoji}${pos.name}${afterRank}${cfg.arrow}${afterArrow}${name}${afterName} ${valueText}`;
}

function section(
  header: string,
  ranked: { name: string; value: number; branch_id: string }[],
  positions: PositionCfgV2[],
  cfg: { arrow: string; spaces_before_arrow: number; spaces_after_arrow: number },
  branchSpaces: Record<string, number> | undefined,
): string {
  const lines: string[] = [header];
  ranked.forEach((r, i) => {
    const p = positions[Math.min(i, positions.length - 1)];
    // insert a separator between top-3 and the rest
    if (i === 3) lines.push("_______________");
    const extra = branchSpaces?.[r.branch_id] ?? p.spaces_after_name ?? 0;
    lines.push(line(p, r.name, r.value, cfg, i === 0, extra));
  });
  return lines.join("\n");
}

function formatDate(iso: string): string {
  // "YYYY-MM-DD" -> "DD/MM/YYYY"
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function buildReport(
  entryDate: string,
  entries: Entry[],
  settings: ReportSettings,
): { ar: string; en: string } {
  const ar = settings.ar_format;
  const en = settings.en_format;
  const cfgAr = {
    arrow: ar.arrow,
    spaces_before_arrow: ar.spaces_before_arrow,
    spaces_after_arrow: ar.spaces_after_arrow,
  };
  const cfgEn = {
    arrow: en.arrow,
    spaces_before_arrow: en.spaces_before_arrow,
    spaces_after_arrow: en.spaces_after_arrow,
  };

  const evm3Ar = rank(entries, (e) => e.evm3_units).map((e) => ({
    name: e.name_ar,
    value: e.evm3_units,
    branch_id: e.branch_id,
  }));
  const cheeseAr = rank(entries, (e) => e.cheese_units).map((e) => ({
    name: e.name_ar,
    value: e.cheese_units,
    branch_id: e.branch_id,
  }));
  const evm3En = rank(entries, (e) => e.evm3_units).map((e) => ({
    name: e.name_en,
    value: e.evm3_units,
    branch_id: e.branch_id,
  }));
  const cheeseEn = rank(entries, (e) => e.cheese_units).map((e) => ({
    name: e.name_en,
    value: e.cheese_units,
    branch_id: e.branch_id,
  }));

  const bestEvm3Ar = evm3Ar[0]?.name ?? "";
  const bestCheeseAr = cheeseAr[0]?.name ?? "";
  const bestEvm3En = evm3En[0]?.name ?? "";
  const bestCheeseEn = cheeseEn[0]?.name ?? "";

  const arText = [
    `${ar.title_ar} (${formatDate(entryDate)})`,
    ``,
    `⭐ ${ar.best_evm3_label}${spaces(ar.best_evm3_spaces ?? 1)}${ar.arrow} (${bestEvm3Ar}) ✨`,
    `⭐ ${ar.best_cheese_label}${spaces(ar.best_cheese_spaces ?? 1)}${ar.arrow} (${bestCheeseAr}) ✨`,
    ``,
    section(ar.meal_emojis, evm3Ar, ar.positions, cfgAr, ar.branch_name_spaces),
    ``,
    section(ar.cheese_emojis, cheeseAr, ar.positions, cfgAr, ar.branch_name_spaces),
  ].join("\n");

  const enText = [
    en.greeting,
    ``,
    `• ${en.intro} (${formatDate(entryDate)})`,
    `🍔 ${en.best_evm3_label}    ${en.arrow} (${bestEvm3En}) ✨`,
    `🧀 ${en.best_cheese_label} ${en.arrow} (${bestCheeseEn}) ✨`,
    en.closing,
    ``,
    section(en.meal_header, evm3En, en.positions, cfgEn, en.branch_name_spaces),
    ``,
    section(en.cheese_header, cheeseEn, en.positions, cfgEn, en.branch_name_spaces),
  ].join("\n");

  return { ar: arText, en: enText };
}

// Parse a free-text report (mixed languages/formats). Returns entries keyed by
// branch id — unresolved lines are skipped. `branches` supplies the canonical
// names for fuzzy matching (see normalize.ts).
import { matchBranch, type BranchLite } from "./normalize";

export function parseFreeText(
  text: string,
  branches: BranchLite[],
): { branch_id: string; name_ar: string; name_en: string; evm3_units: number; cheese_units: number }[] {
  const lines = text.split(/\r?\n/);
  type Bucket = { evm3?: number; cheese?: number };
  const acc = new Map<string, Bucket>();
  let current: BranchLite | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Try to detect a branch on this line — strip digits and known label
    // words first so "Evm3", "EVM3 unit", "cheese unit" don't leak in.
    const forNameMatch = line
      .replace(/evm\s*3?/gi, " ")
      .replace(/extra\s*cheese|cheese|جبن/gi, " ")
      .replace(/large\s*meal|meal|وجبه\s*كبير|كبير|units?/gi, " ")
      .replace(/\d+/g, " ");
    const b = matchBranch(forNameMatch, branches);
    if (b && !/evm|cheese|جبن|وجبه|كبير|extra|unit/i.test(line)) {
      current = b;
    }

    const isCheese = /cheese|جبن/i.test(line);
    const isEvm3 = /evm|وجبه\s*كبير|large|meal/i.test(line);
    // Prefer a number that follows "=" or ":" (the actual value).
    // Fall back to any number AFTER stripping the "evm3" / "3" label token.
    const cleaned = line.replace(/evm\s*3?/gi, " ");
    const m =
      line.match(/[=:]\s*(\d+[\d,]*)/) ??
      cleaned.match(/(\d+[\d,]*)/);
    if (!current || !m) continue;
    const value = parseInt(m[1].replace(/,/g, ""), 10);
    if (!Number.isFinite(value)) continue;

    const bucket = acc.get(current.id) ?? {};
    if (isCheese) bucket.cheese = value;
    else if (isEvm3) bucket.evm3 = value;
    else if (bucket.evm3 === undefined) bucket.evm3 = value;
    else if (bucket.cheese === undefined) bucket.cheese = value;
    acc.set(current.id, bucket);
  }

  const out: {
    branch_id: string;
    name_ar: string;
    name_en: string;
    evm3_units: number;
    cheese_units: number;
  }[] = [];
  for (const b of branches) {
    const v = acc.get(b.id);
    if (!v) continue;
    out.push({
      branch_id: b.id,
      name_ar: b.name_ar,
      name_en: b.name_en,
      evm3_units: v.evm3 ?? 0,
      cheese_units: v.cheese ?? 0,
    });
  }
  return out;
}
