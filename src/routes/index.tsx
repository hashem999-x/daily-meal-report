import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  login,
  logout,
  me,
  saveEntry,
  getMyEntry,
  getReport,
  getDashboard,
  getSettings,
  saveSettings,
  listBranches,
  saveBranch,
  deleteBranch,
  parseAndFormat,
} from "@/lib/api.functions";
import {
  clearSession,
  loadSession,
  saveSession,
  type Session,
} from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Daily Restaurant Report" },
      {
        name: "description",
        content:
          "Code-only login for branches, area manager and admin — daily EVM3 and cheese entry with auto-generated ranked bilingual report.",
      },
      { property: "og:title", content: "Daily Restaurant Report" },
      {
        property: "og:description",
        content:
          "Branch daily reports, ranked bilingual output, area-manager dashboard and admin controls.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  if (!session) {
    return (
      <Login
        onLogin={(s) => {
          saveSession(s);
          setSession(s);
        }}
      />
    );
  }
  return (
    <AppShell
      session={session}
      onLogout={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

// ============================ Login ============================

function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const call = useServerFn(login);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const s = await call({ data: { code } });
      onLogin(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm border rounded-xl p-8 shadow-sm bg-card"
      >
        <h1 className="text-2xl font-semibold text-center">Access Code</h1>
        <input
          autoFocus
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="Enter your branch code"
          className="mt-6 w-full text-center text-2xl tracking-widest border rounded-md py-3 bg-background"
        />
        {err ? (
          <p className="text-sm text-destructive mt-3 text-center">{err}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !code}
          className="mt-4 w-full bg-primary text-primary-foreground rounded-md py-2 font-medium disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-8 text-center text-[10px] text-muted-foreground">
          MADE BY HASHEM AL-ZABIDI
        </p>
      </form>
    </div>
  );
}

// ============================ Shell ============================

type Tab = "entry" | "report" | "dashboard" | "settings" | "branches" | "paste";

function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const callLogout = useServerFn(logout);
  const callMe = useServerFn(me);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof callMe>> | null>(null);
  const isBranch = session.role === "branch";
  const isAdmin = session.role === "admin";
  const isManagerOrAdmin = session.role === "admin" || session.role === "area_manager";
  const [tab, setTab] = useState<Tab>(isBranch ? "entry" : "dashboard");

  useEffect(() => {
    callMe({ data: { token: session.token } })
      .then(setInfo)
      .catch(() => onLogout());
  }, []);

  async function handleLogout() {
    try {
      await callLogout({ data: { token: session.token } });
    } catch {}
    onLogout();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="font-semibold">Daily Restaurant Report</div>
          <div className="text-sm text-muted-foreground">
            {session.displayName}
            {info?.branchName ? ` · ${info.branchName.split(" / ")[0]}` : ""}
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            {isBranch && (
              <TabBtn active={tab === "entry"} onClick={() => setTab("entry")}>
                Daily entry
              </TabBtn>
            )}
            {isManagerOrAdmin && (
              <>
                <TabBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
                  Dashboard
                </TabBtn>
                <TabBtn active={tab === "report"} onClick={() => setTab("report")}>
                  Today's report
                </TabBtn>
                <TabBtn active={tab === "paste"} onClick={() => setTab("paste")}>
                  Paste &amp; format
                </TabBtn>
                <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>
                  Settings
                </TabBtn>
              </>
            )}
            {isAdmin && (
              <TabBtn active={tab === "branches"} onClick={() => setTab("branches")}>
                Branches
              </TabBtn>
            )}
            <button
              onClick={handleLogout}
              className="border rounded-md px-3 py-1.5 text-sm hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === "entry" && isBranch && <BranchEntry token={session.token} />}
        {tab === "dashboard" && isManagerOrAdmin && <Dashboard token={session.token} />}
        {tab === "report" && isManagerOrAdmin && <ReportView token={session.token} />}
        {tab === "paste" && isManagerOrAdmin && <PasteFormat token={session.token} />}
        {tab === "settings" && isManagerOrAdmin && <SettingsView token={session.token} />}
        {tab === "branches" && isAdmin && <BranchesAdmin token={session.token} />}
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-6 text-center text-[10px] text-muted-foreground">
        MADE BY HASHEM AL-ZABIDI
      </footer>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm border ${
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

// ============================ Branch entry ============================

function BranchEntry({ token }: { token: string }) {
  const call = useServerFn(getMyEntry);
  const save = useServerFn(saveEntry);
  const [yesterday, setYesterday] = useState<string>("");
  const [evm3, setEvm3] = useState("");
  const [cheese, setCheese] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isLast, setIsLast] = useState(false);
  const [report, setReport] = useState<{ ar: string; en: string } | null>(null);

  useEffect(() => {
    call({ data: { token } }).then((r) => {
      setYesterday(r.yesterday ?? "");
      if (r.entry) {
        setEvm3(String(r.entry.evm3_units));
        setCheese(String(r.entry.cheese_units));
      }
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await save({
        data: { token, evm3: Number(evm3), cheese: Number(cheese) },
      });
      if (r.isLast && r.report) {
        setIsLast(true);
        setReport(r.report);
        setMsg("You're the LAST branch to submit — the report is ready below.");
      } else {
        setMsg("Saved. Thank you!");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="border rounded-xl p-6 bg-card">
        <h2 className="text-xl font-semibold">Daily entry</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Report for <span className="font-mono">{yesterday}</span> (yesterday)
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="EVM3 (Large meal) units">
            <input
              type="number"
              min={0}
              value={evm3}
              onChange={(e) => setEvm3(e.target.value)}
              className="w-full border rounded-md py-2 px-3 bg-background"
              required
            />
          </Field>
          <Field label="Cheese units">
            <input
              type="number"
              min={0}
              value={cheese}
              onChange={(e) => setCheese(e.target.value)}
              className="w-full border rounded-md py-2 px-3 bg-background"
              required
            />
          </Field>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          {msg ? (
            <p
              className={`text-sm ${
                isLast ? "font-semibold text-primary" : "text-muted-foreground"
              }`}
            >
              {msg}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary text-primary-foreground rounded-md py-2 font-medium disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
      {report ? <ReportBlock report={report} /> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// ============================ Report view ============================

function ReportView({ token }: { token: string }) {
  const call = useServerFn(getReport);
  const [state, setState] = useState<Awaited<ReturnType<typeof call>> | null>(null);

  useEffect(() => {
    call({ data: { token } }).then(setState);
  }, []);

  if (!state) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-6 bg-card">
        <h2 className="text-xl font-semibold">
          Report for <span className="font-mono">{state.entryDate}</span>
        </h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Branch</th>
              <th>EVM3</th>
              <th>Cheese</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {state.merged.map((m) => (
              <tr key={m.branch_id} className="border-t">
                <td className="py-1.5">{m.name_en}</td>
                <td>{m.evm3_units}</td>
                <td>{m.cheese_units}</td>
                <td>
                  {m.submitted ? (
                    <span className="text-primary">Submitted</span>
                  ) : (
                    <span className="text-destructive">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.complete ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Waiting on {state.merged.filter((m) => !m.submitted).length} more branch(es) before the full report is generated.
          </p>
        ) : null}
      </div>
      {state.report ? <ReportBlock report={state.report} /> : null}
    </div>
  );
}

function ReportBlock({ report }: { report: { ar: string; en: string } }) {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <ReportPane title="Arabic" text={report.ar} dir="rtl" />
      <ReportPane title="English" text={report.en} dir="ltr" />
    </div>
  );
}

function ReportPane({
  title,
  text,
  dir,
}: {
  title: string;
  text: string;
  dir: "rtl" | "ltr";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs border rounded-md px-2 py-1 hover:bg-accent"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre
        dir={dir}
        className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed bg-background border rounded-md p-3 max-h-[500px] overflow-auto"
      >
        {text}
      </pre>
    </div>
  );
}

// ============================ Dashboard ============================

function Dashboard({ token }: { token: string }) {
  const call = useServerFn(getDashboard);
  const [state, setState] = useState<Awaited<ReturnType<typeof call>> | null>(null);
  useEffect(() => {
    call({ data: { token } }).then(setState);
  }, []);

  if (!state) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Totals dashboard</h2>
      <p className="text-sm text-muted-foreground">
        Today: <span className="font-mono">{state.today}</span>. Month-to-date resets each new month; historic months remain in history.
      </p>
      <div className="overflow-auto border rounded-xl bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2">Branch</th>
              <th className="text-right p-2">MTD EVM3</th>
              <th className="text-right p-2">MTD Cheese</th>
              <th className="text-right p-2">YTD EVM3</th>
              <th className="text-right p-2">YTD Cheese</th>
              <th className="text-right p-2">Last yr EVM3</th>
              <th className="text-right p-2">Last yr Cheese</th>
            </tr>
          </thead>
          <tbody>
            {state.branches.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-2">{b.name_en} / {b.name_ar}</td>
                <td className="p-2 text-right">{b.totals.mtd.evm3}</td>
                <td className="p-2 text-right">{b.totals.mtd.cheese}</td>
                <td className="p-2 text-right">{b.totals.ytd.evm3}</td>
                <td className="p-2 text-right">{b.totals.ytd.cheese}</td>
                <td className="p-2 text-right">{b.totals.lastYear.evm3}</td>
                <td className="p-2 text-right">{b.totals.lastYear.cheese}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================ Settings ============================

function SettingsView({ token }: { token: string }) {
  const call = useServerFn(getSettings);
  const save = useServerFn(saveSettings);
  const [state, setState] = useState<Awaited<ReturnType<typeof call>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    call({ data: { token } }).then(setState);
  }, []);

  if (!state) return <p className="text-sm text-muted-foreground">Loading…</p>;

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await save({
        data: {
          token,
          ar_format: state!.ar_format,
          en_format: state!.en_format,
        },
      });
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const ar = state.ar_format;
  const en = state.en_format;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Report format settings</h2>
        <button
          onClick={submit}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <FormatEditor
        title="Arabic format"
        arrow={ar.arrow}
        spacesBefore={ar.spaces_before_arrow}
        spacesAfter={ar.spaces_after_arrow}
        positions={ar.positions}
        onArrow={(v) => setState({ ...state, ar_format: { ...ar, arrow: v } })}
        onSpacesBefore={(v) => setState({ ...state, ar_format: { ...ar, spaces_before_arrow: v } })}
        onSpacesAfter={(v) => setState({ ...state, ar_format: { ...ar, spaces_after_arrow: v } })}
        onPositions={(positions) => setState({ ...state, ar_format: { ...ar, positions } })}
        extras={
          <>
            <TextRow
              label="Meal section header"
              value={ar.meal_emojis}
              onChange={(v) => setState({ ...state, ar_format: { ...ar, meal_emojis: v } })}
            />
            <TextRow
              label="Cheese section header"
              value={ar.cheese_emojis}
              onChange={(v) => setState({ ...state, ar_format: { ...ar, cheese_emojis: v } })}
            />
          </>
        }
      />

      <FormatEditor
        title="English format"
        arrow={en.arrow}
        spacesBefore={en.spaces_before_arrow}
        spacesAfter={en.spaces_after_arrow}
        positions={en.positions}
        onArrow={(v) => setState({ ...state, en_format: { ...en, arrow: v } })}
        onSpacesBefore={(v) => setState({ ...state, en_format: { ...en, spaces_before_arrow: v } })}
        onSpacesAfter={(v) => setState({ ...state, en_format: { ...en, spaces_after_arrow: v } })}
        onPositions={(positions) => setState({ ...state, en_format: { ...en, positions } })}
        extras={
          <>
            <TextRow
              label="Meal section header"
              value={en.meal_header}
              onChange={(v) => setState({ ...state, en_format: { ...en, meal_header: v } })}
            />
            <TextRow
              label="Cheese section header"
              value={en.cheese_header}
              onChange={(v) => setState({ ...state, en_format: { ...en, cheese_header: v } })}
            />
          </>
        }
      />
    </div>
  );
}

function FormatEditor({
  title,
  arrow,
  spacesBefore,
  spacesAfter,
  positions,
  onArrow,
  onSpacesBefore,
  onSpacesAfter,
  onPositions,
  extras,
}: {
  title: string;
  arrow: string;
  spacesBefore: number;
  spacesAfter: number;
  positions: { name: string; emoji: string }[];
  onArrow: (v: string) => void;
  onSpacesBefore: (v: number) => void;
  onSpacesAfter: (v: number) => void;
  onPositions: (v: { name: string; emoji: string }[]) => void;
  extras?: React.ReactNode;
}) {
  return (
    <div className="border rounded-xl p-5 bg-card">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <TextRow label="Arrow" value={arrow} onChange={onArrow} />
        <NumberRow label="Spaces before arrow" value={spacesBefore} onChange={onSpacesBefore} />
        <NumberRow label="Spaces after arrow" value={spacesAfter} onChange={onSpacesAfter} />
      </div>
      {extras}
      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium">Positions</p>
        {positions.map((p, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={p.emoji}
              onChange={(e) => {
                const next = [...positions];
                next[i] = { ...p, emoji: e.target.value };
                onPositions(next);
              }}
              className="border rounded-md px-2 py-1 w-20 text-center bg-background"
            />
            <input
              value={p.name}
              onChange={(e) => {
                const next = [...positions];
                next[i] = { ...p, name: e.target.value };
                onPositions(next);
              }}
              className="border rounded-md px-2 py-1 flex-1 bg-background"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TextRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border rounded-md px-2 py-1 bg-background"
      />
    </label>
  );
}

function NumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="mt-1 w-full border rounded-md px-2 py-1 bg-background"
      />
    </label>
  );
}

// ============================ Branches admin ============================

type BranchRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  sort_order: number;
  active: boolean;
};

function BranchesAdmin({ token }: { token: string }) {
  const list = useServerFn(listBranches);
  const save = useServerFn(saveBranch);
  const del = useServerFn(deleteBranch);
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [draft, setDraft] = useState<Partial<BranchRow>>({
    code: "",
    name_ar: "",
    name_en: "",
    sort_order: 0,
    active: true,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const r = await list({ data: { token } });
    setRows(r.branches as BranchRow[]);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function upsert(row: Partial<BranchRow>) {
    setBusy(true);
    setMsg(null);
    try {
      await save({
        data: {
          token,
          id: row.id,
          code: String(row.code ?? ""),
          name_ar: String(row.name_ar ?? ""),
          name_en: String(row.name_en ?? ""),
          sort_order: Number(row.sort_order ?? 0),
          active: row.active ?? true,
        },
      });
      setDraft({ code: "", name_ar: "", name_en: "", sort_order: 0, active: true });
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this branch? All entries for it will be removed too.")) return;
    await del({ data: { token, id } });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Branches &amp; access codes</h2>
      {msg ? <p className="text-sm text-destructive">{msg}</p> : null}

      <div className="border rounded-xl bg-card overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-2 text-left">Code</th>
              <th className="p-2 text-left">Arabic name</th>
              <th className="p-2 text-left">English name</th>
              <th className="p-2 text-left">Order</th>
              <th className="p-2 text-left">Active</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BranchEditor
                key={r.id}
                row={r}
                onSave={(next) => upsert(next)}
                onDelete={() => remove(r.id)}
                busy={busy}
              />
            ))}
            <tr className="border-t bg-muted/20">
              <td className="p-2">
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="e.g. 3440069"
                  className="border rounded-md px-2 py-1 w-full bg-background"
                />
              </td>
              <td className="p-2">
                <input
                  value={draft.name_ar}
                  onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })}
                  className="border rounded-md px-2 py-1 w-full bg-background"
                />
              </td>
              <td className="p-2">
                <input
                  value={draft.name_en}
                  onChange={(e) => setDraft({ ...draft, name_en: e.target.value })}
                  className="border rounded-md px-2 py-1 w-full bg-background"
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  value={draft.sort_order ?? 0}
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
                  className="border rounded-md px-2 py-1 w-20 bg-background"
                />
              </td>
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={draft.active ?? true}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
              </td>
              <td className="p-2">
                <button
                  onClick={() => upsert(draft)}
                  disabled={busy}
                  className="text-sm bg-primary text-primary-foreground rounded-md px-3 py-1"
                >
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Editing a branch's code also updates that branch's login code automatically.
      </p>
    </div>
  );
}

function BranchEditor({
  row,
  onSave,
  onDelete,
  busy,
}: {
  row: BranchRow;
  onSave: (row: BranchRow) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [r, setR] = useState<BranchRow>(row);
  useEffect(() => setR(row), [row]);
  const dirty =
    r.code !== row.code ||
    r.name_ar !== row.name_ar ||
    r.name_en !== row.name_en ||
    r.sort_order !== row.sort_order ||
    r.active !== row.active;

  return (
    <tr className="border-t">
      <td className="p-2">
        <input
          value={r.code}
          onChange={(e) => setR({ ...r, code: e.target.value })}
          className="border rounded-md px-2 py-1 w-full bg-background"
        />
      </td>
      <td className="p-2">
        <input
          value={r.name_ar}
          onChange={(e) => setR({ ...r, name_ar: e.target.value })}
          className="border rounded-md px-2 py-1 w-full bg-background"
        />
      </td>
      <td className="p-2">
        <input
          value={r.name_en}
          onChange={(e) => setR({ ...r, name_en: e.target.value })}
          className="border rounded-md px-2 py-1 w-full bg-background"
        />
      </td>
      <td className="p-2">
        <input
          type="number"
          value={r.sort_order}
          onChange={(e) => setR({ ...r, sort_order: Number(e.target.value) || 0 })}
          className="border rounded-md px-2 py-1 w-20 bg-background"
        />
      </td>
      <td className="p-2">
        <input
          type="checkbox"
          checked={r.active}
          onChange={(e) => setR({ ...r, active: e.target.checked })}
        />
      </td>
      <td className="p-2 flex gap-2">
        <button
          disabled={!dirty || busy}
          onClick={() => onSave(r)}
          className="text-sm border rounded-md px-2 py-1 hover:bg-accent disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={onDelete}
          className="text-sm border rounded-md px-2 py-1 text-destructive hover:bg-destructive/10"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

// ============================ Paste & format ============================

function PasteFormat({ token }: { token: string }) {
  const call = useServerFn(parseAndFormat);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<Awaited<ReturnType<typeof call>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await call({ data: { token, text } });
      setState(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Paste &amp; format</h2>
      <p className="text-sm text-muted-foreground">
        Paste a raw report (any format, mixed languages, typos are OK) and generate a clean ranked report using your current settings.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        className="w-full border rounded-md p-3 font-mono text-sm bg-background"
        placeholder="EVENT&#10;Evm3 unit = 540&#10;Extra cheese unit = 608&#10;…"
      />
      <div className="flex gap-2 items-center">
        <button
          onClick={run}
          disabled={busy || !text.trim()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {busy ? "Formatting…" : "Format report"}
        </button>
        {state ? (
          <span className="text-xs text-muted-foreground">
            Matched {state.matched} of {state.total} branches
          </span>
        ) : null}
      </div>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      {state?.report ? <ReportBlock report={state.report} /> : null}
    </div>
  );
}
