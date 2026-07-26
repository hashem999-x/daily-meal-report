import { createServerFn } from "@tanstack/react-start";
import { buildReport, parseFreeText, type ReportSettings } from "./report";

// ---- helpers loaded lazily inside handlers ----
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Yesterday in Asia/Riyadh (UTC+3), returned as YYYY-MM-DD.
function yesterdayRiyadh(): string {
  const now = Date.now();
  const riyadh = new Date(now + 3 * 3600 * 1000 - 24 * 3600 * 1000);
  return riyadh.toISOString().slice(0, 10);
}
function todayRiyadh(): string {
  const now = Date.now();
  const r = new Date(now + 3 * 3600 * 1000);
  return r.toISOString().slice(0, 10);
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type SessionRow = {
  account: {
    id: string;
    role: "admin" | "area_manager" | "branch";
    branch_id: string | null;
    display_name: string | null;
    code: string;
  };
};

async function requireSession(token: string): Promise<SessionRow["account"]> {
  if (!token) throw new Error("Unauthorized");
  const supa = await getAdmin();
  const { data, error } = await supa
    .from("sessions")
    .select("account_id, expires_at, accounts:account_id (id, role, branch_id, display_name, code)")
    .eq("token", token)
    .maybeSingle();
  if (error || !data || !data.accounts) throw new Error("Unauthorized");
  if (new Date((data as any).expires_at).getTime() < Date.now()) {
    throw new Error("Session expired");
  }
  return (data as any).accounts;
}

function requireRole(
  acc: SessionRow["account"],
  roles: Array<SessionRow["account"]["role"]>,
) {
  if (!roles.includes(acc.role)) throw new Error("Forbidden");
}

// ---- login ----
export const login = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({ code: String(d.code ?? "").trim() }))
  .handler(async ({ data }) => {
    if (!data.code) throw new Error("Enter access code");
    const supa = await getAdmin();
    const { data: acc, error } = await supa
      .from("accounts")
      .select("id, role, branch_id, display_name, code")
      .eq("code", data.code)
      .maybeSingle();
    if (error || !acc) throw new Error("Invalid access code");
    const token = newToken();
    const { error: sErr } = await supa
      .from("sessions")
      .insert({ token, account_id: acc.id });
    if (sErr) throw new Error("Login failed");
    return {
      token,
      role: acc.role as "admin" | "area_manager" | "branch",
      branchId: acc.branch_id as string | null,
      displayName: (acc.display_name ?? acc.code) as string,
    };
  });

// ---- logout ----
export const logout = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }) => {
    const supa = await getAdmin();
    await supa.from("sessions").delete().eq("token", data.token);
    return { ok: true };
  });

// ---- me: session details + branch info ----
export const me = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    const supa = await getAdmin();
    let branchName: string | null = null;
    if (acc.branch_id) {
      const { data: b } = await supa
        .from("branches")
        .select("name_en, name_ar")
        .eq("id", acc.branch_id)
        .maybeSingle();
      if (b) branchName = `${b.name_en} / ${b.name_ar}`;
    }
    return {
      role: acc.role,
      branchId: acc.branch_id,
      displayName: acc.display_name ?? acc.code,
      branchName,
      yesterday: yesterdayRiyadh(),
    };
  });

// ---- branch: save today's entry (for yesterday) ----
export const saveEntry = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; evm3: number; cheese: number }) => ({
    token: String(d.token ?? ""),
    evm3: Math.max(0, Math.floor(Number(d.evm3) || 0)),
    cheese: Math.max(0, Math.floor(Number(d.cheese) || 0)),
  }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    if (acc.role !== "branch" || !acc.branch_id) {
      throw new Error("Only branches can save entries");
    }
    const supa = await getAdmin();
    const entryDate = yesterdayRiyadh();
    const { error } = await supa.from("daily_entries").upsert(
      {
        branch_id: acc.branch_id,
        entry_date: entryDate,
        evm3_units: data.evm3,
        cheese_units: data.cheese,
        submitted_by: acc.id,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "branch_id,entry_date" },
    );
    if (error) throw new Error(error.message);

    // Check if all active branches have submitted for this date.
    const { data: branches } = await supa
      .from("branches")
      .select("id, name_ar, name_en, sort_order")
      .eq("active", true)
      .order("sort_order");
    const { data: entries } = await supa
      .from("daily_entries")
      .select("branch_id, evm3_units, cheese_units")
      .eq("entry_date", entryDate);
    const submittedIds = new Set((entries ?? []).map((e) => e.branch_id));
    const isLast =
      (branches ?? []).length > 0 &&
      (branches ?? []).every((b) => submittedIds.has(b.id));

    if (!isLast) return { isLast: false, entryDate };

    // Build the compiled report.
    const merged = (branches ?? []).map((b) => {
      const e = (entries ?? []).find((x) => x.branch_id === b.id);
      return {
        branch_id: b.id,
        name_ar: b.name_ar,
        name_en: b.name_en,
        evm3_units: e?.evm3_units ?? 0,
        cheese_units: e?.cheese_units ?? 0,
      };
    });
    const settings = await loadSettings();
    const report = buildReport(entryDate, merged, settings);
    return { isLast: true, entryDate, report };
  });

async function loadSettings(): Promise<ReportSettings> {
  const supa = await getAdmin();
  const { data } = await supa
    .from("report_settings")
    .select("ar_format, en_format")
    .eq("id", 1)
    .maybeSingle();
  return {
    ar_format: (data?.ar_format ?? {}) as ReportSettings["ar_format"],
    en_format: (data?.en_format ?? {}) as ReportSettings["en_format"],
  };
}

// ---- pull an existing branch entry (for pre-fill on the branch entry page) ----
export const getMyEntry = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    if (acc.role !== "branch" || !acc.branch_id) return { entry: null };
    const supa = await getAdmin();
    const { data: e } = await supa
      .from("daily_entries")
      .select("evm3_units, cheese_units, entry_date")
      .eq("branch_id", acc.branch_id)
      .eq("entry_date", yesterdayRiyadh())
      .maybeSingle();
    return { entry: e ?? null, yesterday: yesterdayRiyadh() };
  });

// ---- current report (for admin/manager view or after last-save) ----
export const getReport = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; date?: string }) => ({
    token: String(d.token ?? ""),
    date: d.date ? String(d.date) : undefined,
  }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    requireRole(acc, ["admin", "area_manager"]);
    const supa = await getAdmin();
    const entryDate = data.date ?? yesterdayRiyadh();
    const { data: branches } = await supa
      .from("branches")
      .select("id, name_ar, name_en, sort_order")
      .eq("active", true)
      .order("sort_order");
    const { data: entries } = await supa
      .from("daily_entries")
      .select("branch_id, evm3_units, cheese_units")
      .eq("entry_date", entryDate);
    const merged = (branches ?? []).map((b) => {
      const e = (entries ?? []).find((x) => x.branch_id === b.id);
      return {
        branch_id: b.id,
        name_ar: b.name_ar,
        name_en: b.name_en,
        evm3_units: e?.evm3_units ?? 0,
        cheese_units: e?.cheese_units ?? 0,
        submitted: !!e,
      };
    });
    const settings = await loadSettings();
    const complete = merged.every((m) => m.submitted);
    const report = complete
      ? buildReport(entryDate, merged, settings)
      : null;
    return { entryDate, merged, complete, report };
  });

// ---- dashboard totals (admin + area manager) ----
export const getDashboard = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    requireRole(acc, ["admin", "area_manager"]);
    const supa = await getAdmin();
    const { data: branches } = await supa
      .from("branches")
      .select("id, name_ar, name_en, sort_order")
      .order("sort_order");
    const today = todayRiyadh();
    const [y, m] = today.split("-");
    const monthStart = `${y}-${m}-01`;
    const yearStart = `${y}-01-01`;
    const prevYearStart = `${Number(y) - 1}-01-01`;
    const prevYearEnd = `${Number(y) - 1}-12-31`;

    const { data: rows } = await supa
      .from("daily_entries")
      .select("branch_id, entry_date, evm3_units, cheese_units")
      .gte("entry_date", prevYearStart);

    const zero = () => ({ evm3: 0, cheese: 0 });
    const totals: Record<
      string,
      { mtd: ReturnType<typeof zero>; ytd: ReturnType<typeof zero>; lastYear: ReturnType<typeof zero> }
    > = {};
    (branches ?? []).forEach((b) => (totals[b.id] = { mtd: zero(), ytd: zero(), lastYear: zero() }));
    for (const r of rows ?? []) {
      const t = totals[r.branch_id as string];
      if (!t) continue;
      const d = r.entry_date as string;
      if (d >= monthStart) {
        t.mtd.evm3 += r.evm3_units ?? 0;
        t.mtd.cheese += r.cheese_units ?? 0;
      }
      if (d >= yearStart) {
        t.ytd.evm3 += r.evm3_units ?? 0;
        t.ytd.cheese += r.cheese_units ?? 0;
      }
      if (d >= prevYearStart && d <= prevYearEnd) {
        t.lastYear.evm3 += r.evm3_units ?? 0;
        t.lastYear.cheese += r.cheese_units ?? 0;
      }
    }
    return {
      today,
      branches: (branches ?? []).map((b) => ({
        id: b.id,
        name_ar: b.name_ar,
        name_en: b.name_en,
        totals: totals[b.id],
      })),
    };
  });

// ---- settings ----
export const getSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    requireRole(acc, ["admin", "area_manager"]);
    const settings = await loadSettings();
    const supa = await getAdmin();
    const { data: branches } = await supa
      .from("branches")
      .select("id, name_ar, name_en, sort_order")
      .order("sort_order");
    return {
      ...settings,
      branches: (branches ?? []).map((b) => ({
        id: b.id as string,
        name_ar: b.name_ar as string,
        name_en: b.name_en as string,
      })),
    };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; ar_format: unknown; en_format: unknown }) => ({
    token: String(d.token ?? ""),
    ar_format: d.ar_format,
    en_format: d.en_format,
  }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    requireRole(acc, ["admin", "area_manager"]);
    const supa = await getAdmin();
    const { error } = await supa
      .from("report_settings")
      .update({
        ar_format: data.ar_format as any,
        en_format: data.en_format as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- branches (admin) ----
export const listBranches = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    requireRole(acc, ["admin", "area_manager"]);
    const supa = await getAdmin();
    const { data: branches } = await supa
      .from("branches")
      .select("id, code, name_ar, name_en, sort_order, active")
      .order("sort_order");
    return { branches: branches ?? [] };
  });

export const saveBranch = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      token: string;
      id?: string;
      code: string;
      name_ar: string;
      name_en: string;
      sort_order: number;
      active: boolean;
    }) => ({
      token: String(d.token ?? ""),
      id: d.id ? String(d.id) : undefined,
      code: String(d.code ?? "").trim(),
      name_ar: String(d.name_ar ?? "").trim(),
      name_en: String(d.name_en ?? "").trim(),
      sort_order: Math.floor(Number(d.sort_order) || 0),
      active: !!d.active,
    }),
  )
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    requireRole(acc, ["admin"]);
    if (!data.code || !data.name_ar || !data.name_en) {
      throw new Error("Code, Arabic name and English name are required");
    }
    const supa = await getAdmin();
    if (data.id) {
      const { error } = await supa
        .from("branches")
        .update({
          code: data.code,
          name_ar: data.name_ar,
          name_en: data.name_en,
          sort_order: data.sort_order,
          active: data.active,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      // keep the branch account's code in sync
      await supa
        .from("accounts")
        .update({ code: data.code, display_name: data.name_en })
        .eq("branch_id", data.id);
      return { id: data.id };
    }
    const { data: created, error } = await supa
      .from("branches")
      .insert({
        code: data.code,
        name_ar: data.name_ar,
        name_en: data.name_en,
        sort_order: data.sort_order,
        active: data.active,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Insert failed");
    // create the branch account
    await supa.from("accounts").insert({
      code: data.code,
      role: "branch",
      branch_id: created.id,
      display_name: data.name_en,
    });
    return { id: created.id };
  });

export const deleteBranch = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; id: string }) => ({
    token: String(d.token ?? ""),
    id: String(d.id ?? ""),
  }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    requireRole(acc, ["admin"]);
    const supa = await getAdmin();
    const { error } = await supa.from("branches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- paste-and-format tool ----
export const parseAndFormat = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; text: string; date?: string }) => ({
    token: String(d.token ?? ""),
    text: String(d.text ?? ""),
    date: d.date ? String(d.date) : undefined,
  }))
  .handler(async ({ data }) => {
    const acc = await requireSession(data.token);
    requireRole(acc, ["admin", "area_manager"]);
    const supa = await getAdmin();
    const { data: branches } = await supa
      .from("branches")
      .select("id, code, name_ar, name_en, sort_order")
      .eq("active", true)
      .order("sort_order");
    const parsed = parseFreeText(data.text, (branches ?? []).map((b) => ({
      id: b.id,
      name_ar: b.name_ar,
      name_en: b.name_en,
      code: b.code,
    })));
    const entryDate = data.date ?? yesterdayRiyadh();
    // Fill in zero rows for any missing branches so the report is complete.
    const merged = (branches ?? []).map((b) => {
      const e = parsed.find((p) => p.branch_id === b.id);
      return {
        branch_id: b.id,
        name_ar: b.name_ar,
        name_en: b.name_en,
        evm3_units: e?.evm3_units ?? 0,
        cheese_units: e?.cheese_units ?? 0,
      };
    });
    const settings = await loadSettings();
    const report = buildReport(entryDate, merged, settings);
    const matched = parsed.length;
    return { report, matched, total: (branches ?? []).length, entryDate };
  });