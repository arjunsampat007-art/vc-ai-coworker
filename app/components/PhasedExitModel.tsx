"use client";

// Self-contained preview tab — models exiting a position IN PARTS (tranches).
// Each tranche sells a % of the remaining holding at its own multiple; whatever
// is unsold by the terminal year is marked as residual (unrealized) value.
// Returns use realized cash (DPI), residual (RVPI), total (TVPI) and a true
// dated-cashflow IRR. Nothing here is shared with the other tabs.

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Currency = "INR" | "USD";

const INR_PER_USD = 95;
const CR_TO_USD_M = 10 / INR_PER_USD;

const formatMoney = (valueCr: number, currency: Currency, digits = 0) =>
  currency === "USD"
    ? `$${(valueCr * CR_TO_USD_M).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}M`
    : `₹${valueCr.toLocaleString("en-IN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })} Cr`;

const mult = (value: number) => `${value.toFixed(1)}×`;
const pct = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

type Tranche = { year: number; sellPct: number; multiple: number };

type CompanyPreset = {
  name: string;
  sector: string;
  totalInvestment: number;
  currentStake: number;
  currentYear: number;
  currentRevenue: number;
  currentEbitda: number;
  benchmarkRevMultiple: number;
  targetRevenue: number;
  terminalYear: number;
  terminalMultiple: number;
  tranches: Tranche[];
};

const PORTFOLIO: CompanyPreset[] = [
  {
    name: "Lohum",
    sector: "Battery recycling / EV materials",
    totalInvestment: 60,
    currentStake: 8,
    currentYear: 2026,
    currentRevenue: 120,
    currentEbitda: 14,
    benchmarkRevMultiple: 4,
    targetRevenue: 700,
    terminalYear: 2032,
    terminalMultiple: 3.8,
    tranches: [
      { year: 2029, sellPct: 30, multiple: 4.2 },
      { year: 2031, sellPct: 50, multiple: 3.9 },
    ],
  },
  {
    name: "Brandworks",
    sector: "Consumer / D2C brands",
    totalInvestment: 30,
    currentStake: 15,
    currentYear: 2026,
    currentRevenue: 80,
    currentEbitda: 8,
    benchmarkRevMultiple: 5,
    targetRevenue: 245,
    terminalYear: 2031,
    terminalMultiple: 4,
    tranches: [
      { year: 2029, sellPct: 40, multiple: 5 },
      { year: 2030, sellPct: 60, multiple: 4.5 },
    ],
  },
  {
    name: "Kapture",
    sector: "SaaS / customer experience",
    totalInvestment: 25,
    currentStake: 18,
    currentYear: 2026,
    currentRevenue: 60,
    currentEbitda: 9,
    benchmarkRevMultiple: 8,
    targetRevenue: 180,
    terminalYear: 2030,
    terminalMultiple: 7,
    tranches: [{ year: 2029, sellPct: 50, multiple: 7.5 }],
  },
];

// Dated-cashflow IRR (annual periods), solved by bisection. Returns null when
// there is no sign change (can't solve).
function computeIrr(cashflows: { t: number; cf: number }[]): number | null {
  const npv = (r: number) =>
    cashflows.reduce((sum, { t, cf }) => sum + cf / Math.pow(1 + r, t), 0);
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export default function PhasedExitModel() {
  const [company, setCompany] = useState(PORTFOLIO[0].name);
  const [currency, setCurrency] = useState<Currency>("INR");
  const money = (v: number, d = 0) => formatMoney(v, currency, d);

  const initial = PORTFOLIO[0];
  const [totalInvestment, setTotalInvestment] = useState(initial.totalInvestment);
  const [currentStake, setCurrentStake] = useState(initial.currentStake);
  const [currentYear, setCurrentYear] = useState(initial.currentYear);
  const [currentRevenue, setCurrentRevenue] = useState(initial.currentRevenue);
  const [targetRevenue, setTargetRevenue] = useState(initial.targetRevenue);
  const [benchmarkRevMultiple, setBenchmarkRevMultiple] = useState(
    initial.benchmarkRevMultiple
  );
  const [terminalYear, setTerminalYear] = useState(initial.terminalYear);
  const [terminalMultiple, setTerminalMultiple] = useState(
    initial.terminalMultiple
  );
  const [tranches, setTranches] = useState<Tranche[]>(initial.tranches);

  const selectCompany = (name: string) => {
    const p = PORTFOLIO.find((c) => c.name === name);
    if (!p) return;
    setCompany(p.name);
    setTotalInvestment(p.totalInvestment);
    setCurrentStake(p.currentStake);
    setCurrentYear(p.currentYear);
    setCurrentRevenue(p.currentRevenue);
    setTargetRevenue(p.targetRevenue);
    setBenchmarkRevMultiple(p.benchmarkRevMultiple);
    setTerminalYear(p.terminalYear);
    setTerminalMultiple(p.terminalMultiple);
    setTranches(p.tranches);
  };

  const sector =
    PORTFOLIO.find((c) => c.name === company)?.sector ?? PORTFOLIO[0].sector;

  const updateTranche = (index: number, patch: Partial<Tranche>) =>
    setTranches((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t))
    );
  const removeTranche = (index: number) =>
    setTranches((prev) => prev.filter((_, i) => i !== index));
  const addTranche = () =>
    setTranches((prev) => {
      const lastYear = prev.length ? prev[prev.length - 1].year : currentYear;
      return [
        ...prev,
        {
          year: Math.min(lastYear + 1, terminalYear),
          sellPct: 25,
          multiple: benchmarkRevMultiple,
        },
      ];
    });

  const model = useMemo(() => {
    // Revenue is driven by the target at the terminal year — same as the other
    // tabs. Growth is the CAGR implied by getting there.
    const span = Math.max(terminalYear - currentYear, 1);
    const impliedCagr =
      currentRevenue > 0
        ? Math.pow(targetRevenue / currentRevenue, 1 / span) - 1
        : 0;
    const revenueAt = (year: number) =>
      currentRevenue * Math.pow(1 + impliedCagr, year - currentYear);

    const sorted = [...tranches].sort((a, b) => a.year - b.year);

    // Each tranche sells a % of the holding remaining after all prior tranches.
    // Remaining before tranche i = stake × Π(1 − sell_k) for k < i.
    const trancheRows = sorted.map((tr, i) => {
      const remainingBefore =
        currentStake *
        sorted
          .slice(0, i)
          .reduce((acc, t) => acc * (1 - clamp(t.sellPct, 0, 100) / 100), 1);
      const soldStake = remainingBefore * (clamp(tr.sellPct, 0, 100) / 100);
      const valuationAtYear = revenueAt(tr.year) * tr.multiple;
      const proceeds = (soldStake / 100) * valuationAtYear;
      return {
        ...tr,
        soldStake,
        proceeds,
        remainingAfter: remainingBefore - soldStake,
      };
    });

    const remaining = trancheRows.length
      ? trancheRows[trancheRows.length - 1].remainingAfter
      : currentStake;
    const residualValuation = revenueAt(terminalYear) * terminalMultiple;
    const residualValue = (remaining / 100) * residualValuation;
    const residualStake = remaining;

    const realizedProceeds = trancheRows.reduce((s, t) => s + t.proceeds, 0);
    const dpi = totalInvestment > 0 ? realizedProceeds / totalInvestment : 0;
    const rvpi = totalInvestment > 0 ? residualValue / totalInvestment : 0;
    const tvpi = dpi + rvpi;

    // Dated cashflows: -investment at t0, +proceeds at each tranche, +residual
    // at terminal year.
    const rawCfs = [
      { t: 0, cf: -totalInvestment },
      ...trancheRows.map((t) => ({ t: t.year - currentYear, cf: t.proceeds })),
      { t: terminalYear - currentYear, cf: residualValue },
    ];
    const cashflows = Array.from(new Set(rawCfs.map((c) => c.t)))
      .sort((a, b) => a - b)
      .map((t) => ({
        t,
        cf: rawCfs.filter((c) => c.t === t).reduce((s, c) => s + c.cf, 0),
      }));
    const irr = computeIrr(cashflows);

    // Proceeds-weighted average holding period and exit multiple.
    const totalValue = realizedProceeds + residualValue;
    const avgHolding =
      totalValue > 0
        ? (trancheRows.reduce(
            (s, t) => s + t.proceeds * (t.year - currentYear),
            0
          ) +
            residualValue * (terminalYear - currentYear)) /
          totalValue
        : 0;

    // Per-year chart series: distribution bars, cumulative distributions, and
    // remaining (unrealized) holding value marked on an interpolated multiple.
    const series: {
      year: number;
      distribution: number;
      cumulative: number;
      remainingValue: number;
    }[] = [];
    for (let year = currentYear; year <= terminalYear; year++) {
      const dist = trancheRows
        .filter((t) => t.year === year)
        .reduce((s, t) => s + t.proceeds, 0);
      const cumulative = trancheRows
        .filter((t) => t.year <= year)
        .reduce((s, t) => s + t.proceeds, 0);
      const soldSoFar = trancheRows
        .filter((t) => t.year <= year)
        .reduce((s, t) => s + t.soldStake, 0);
      const remHolding = Math.max(currentStake - soldSoFar, 0);
      const frac = (year - currentYear) / span;
      const markMultiple =
        benchmarkRevMultiple + (terminalMultiple - benchmarkRevMultiple) * frac;
      const remainingValue =
        year === terminalYear
          ? residualValue
          : (remHolding / 100) * revenueAt(year) * markMultiple;
      series.push({
        year,
        distribution: Number(dist.toFixed(1)),
        cumulative: Number(cumulative.toFixed(1)),
        remainingValue: Number(remainingValue.toFixed(1)),
      });
    }

    const soldTotalPct = currentStake > 0 ? (currentStake - remaining) : 0;

    return {
      trancheRows,
      residualValue,
      residualStake,
      realizedProceeds,
      dpi,
      rvpi,
      tvpi,
      moic: tvpi,
      impliedCagr,
      irr,
      avgHolding,
      series,
      soldTotalPct,
    };
  }, [
    targetRevenue,
    currentRevenue,
    currentYear,
    currentStake,
    benchmarkRevMultiple,
    terminalYear,
    terminalMultiple,
    tranches,
    totalInvestment,
  ]);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-lg font-bold text-white shadow-lg shadow-emerald-500/30">
              ⇗
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Cactus Partners · Portfolio
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Phased Exit
              </h1>
              <p className="text-sm text-slate-500">{sector}</p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <label className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Company
              </span>
              <select
                value={company}
                onChange={(e) => selectCompany(e.target.value)}
                className="w-full appearance-none rounded-full border border-slate-200 bg-white/80 py-2.5 pl-28 pr-10 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur outline-none transition hover:border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 sm:min-w-[260px]"
              >
                {PORTFOLIO.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                ▾
              </span>
            </label>
            <div className="flex self-end rounded-full border border-slate-200 bg-white/70 p-1 shadow-sm backdrop-blur">
              {(["INR", "USD"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    currency === c
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {c === "INR" ? "₹ INR" : "$ USD"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Return KPIs ───────────────────────────────────── */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="MOIC (TVPI)"
            value={`${model.moic.toFixed(2)}×`}
            detail={`on ${money(totalInvestment)} invested`}
            tone={model.moic >= 1 ? "success" : "danger"}
          />
          <MetricCard
            label="DPI · realized"
            value={`${model.dpi.toFixed(2)}×`}
            detail={`${money(model.realizedProceeds, 1)} cash returned`}
            tone="info"
          />
          <MetricCard
            label="RVPI · residual"
            value={`${model.rvpi.toFixed(2)}×`}
            detail={`${pct(model.residualStake)} unsold = ${money(
              model.residualValue,
              1
            )}`}
            tone="neutral"
          />
          <MetricCard
            label="IRR (dated cashflows)"
            value={model.irr === null ? "—" : pct(model.irr * 100, 1)}
            detail={`~${model.avgHolding.toFixed(1)}y avg hold`}
            tone={model.irr !== null && model.irr >= 0 ? "success" : "danger"}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* ── Inputs ──────────────────────────────────────── */}
          <aside className="h-fit space-y-6 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Model Inputs
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Everything recalculates instantly.
              </p>
            </div>

            <FieldGroup title="Position">
              <SliderField
                label="Total investment in firm"
                value={totalInvestment}
                onChange={setTotalInvestment}
                min={1}
                max={500}
                step={1}
                format={(v) => money(v)}
              />
              <SliderField
                label="Current stake"
                value={currentStake}
                onChange={setCurrentStake}
                min={0}
                max={100}
                step={0.5}
                format={(v) => pct(v)}
              />
              <SliderField
                label="Current year revenue"
                value={currentRevenue}
                onChange={setCurrentRevenue}
                min={1}
                max={1000}
                step={1}
                format={(v) => money(v)}
              />
              <NumberField
                label="Current year"
                value={currentYear}
                onChange={setCurrentYear}
              />
            </FieldGroup>

            <FieldGroup title="Target" theme="target">
              <SliderField
                label="Target revenue (at terminal year)"
                value={targetRevenue}
                onChange={setTargetRevenue}
                min={1}
                max={5000}
                step={5}
                format={(v) => money(v)}
              />
              <NumberField
                label="Terminal year"
                value={terminalYear}
                onChange={setTerminalYear}
              />
              <p className="text-xs text-slate-400">
                Implies {pct(model.impliedCagr * 100)} revenue CAGR to{" "}
                {terminalYear}.
              </p>
            </FieldGroup>

            <FieldGroup title="Residual marks">
              <SliderField
                label="Terminal mark multiple (× revenue)"
                value={terminalMultiple}
                onChange={setTerminalMultiple}
                min={0}
                max={30}
                step={0.1}
                format={mult}
              />
              <SliderField
                label="Today's benchmark multiple (× revenue)"
                value={benchmarkRevMultiple}
                onChange={setBenchmarkRevMultiple}
                min={0}
                max={30}
                step={0.1}
                format={mult}
              />
            </FieldGroup>
          </aside>

          {/* ── Tranches + chart ────────────────────────────── */}
          <section className="space-y-6">
            {/* Tranche editor */}
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Exit tranches
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Each tranche sells a % of the <em>remaining</em> holding at
                    its own multiple.
                  </p>
                </div>
              {(() => {
                  const fullySold = model.residualStake <= 0.0001;
                  return (
                    <button
                      onClick={addTranche}
                      disabled={fullySold}
                      title={
                        fullySold
                          ? "100% of the holding is already sold"
                          : undefined
                      }
                      className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100"
                    >
                      {fullySold ? "Fully sold" : "+ Add tranche"}
                    </button>
                  );
                })()}
              </div>

              <div className="mt-4 grid grid-cols-[1fr_1fr_1fr_1.2fr_auto] items-center gap-x-3 gap-y-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span>Year</span>
                <span>Sell % of holding</span>
                <span>Exit multiple</span>
                <span className="text-right">Proceeds</span>
                <span />
              </div>
              {model.trancheRows.length === 0 && (
                <p className="mt-3 text-sm text-slate-400">
                  No tranches — the whole stake is residual at the terminal year.
                </p>
              )}
              {tranches.map((tr, i) => (
                <div
                  key={i}
                  className="mt-2 grid grid-cols-[1fr_1fr_1fr_1.2fr_auto] items-center gap-x-3"
                >
                  <InlineNumber
                    value={tr.year}
                    onChange={(v) => updateTranche(i, { year: v })}
                  />
                  <InlineNumber
                    value={tr.sellPct}
                    step={5}
                    suffix="%"
                    onChange={(v) => updateTranche(i, { sellPct: v })}
                  />
                  <InlineNumber
                    value={tr.multiple}
                    step={0.1}
                    suffix="×"
                    onChange={(v) => updateTranche(i, { multiple: v })}
                  />
                  <span className="text-right text-sm font-semibold tabular-nums text-slate-900">
                    {money(
                      model.trancheRows.find((r) => r.year === tr.year)
                        ?.proceeds ?? 0,
                      1
                    )}
                  </span>
                  <button
                    onClick={() => removeTranche(i)}
                    className="justify-self-end rounded-lg px-2 py-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove tranche"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Sells <strong>{pct(model.soldTotalPct)}</strong> of the holding
                across {model.trancheRows.length} tranche
                {model.trancheRows.length === 1 ? "" : "s"} ·{" "}
                <strong>{pct(model.residualStake)}</strong> residual marked at{" "}
                {terminalYear} ({money(model.residualValue, 1)}).
              </p>
            </div>

            {/* Distributions chart */}
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
              <h2 className="text-lg font-semibold text-slate-900">
                Capital returned vs. holding drawn down
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Bars = cash out each tranche · green line = cumulative
                distributions · dark line = unsold stake value · amber = cost
              </p>
              <div className="mt-6 h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={model.series}
                    margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 4"
                      stroke="#e2e8f0"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      dy={6}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      width={64}
                      tickFormatter={(value) =>
                        currency === "USD"
                          ? `$${(value * CR_TO_USD_M).toFixed(0)}`
                          : `₹${value}`
                      }
                    />
                    <Tooltip
                      formatter={(value, name) => [money(Number(value), 1), name]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        fontSize: 13,
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 12, fontSize: 13 }} />
                    <ReferenceLine
                      y={totalInvestment}
                      ifOverflow="extendDomain"
                      stroke="#b45309"
                      strokeDasharray="6 4"
                      label={{
                        value: `Invested ${money(totalInvestment)}`,
                        position: "insideTopRight",
                        fill: "#b45309",
                        fontSize: 11,
                      }}
                    />
                    <Bar
                      dataKey="distribution"
                      name="Distribution"
                      fill="#5eead4"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={42}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative distributions"
                      stroke="#059669"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="remainingValue"
                      name="Unsold stake value"
                      stroke="#0f172a"
                      strokeWidth={2.5}
                      strokeDasharray="5 4"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          Preview tab · no dilution or taxes modelled · illustrative · not
          investment advice
        </footer>
      </div>
    </main>
  );
}

type Tone = "neutral" | "info" | "success" | "danger";

const toneStyles: Record<Tone, { bar: string; value: string }> = {
  neutral: { bar: "bg-slate-300", value: "text-slate-900" },
  info: { bar: "bg-teal-500", value: "text-teal-600" },
  success: { bar: "bg-emerald-500", value: "text-emerald-600" },
  danger: { bar: "bg-rose-500", value: "text-rose-600" },
};

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}) {
  const styles = toneStyles[tone];
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`absolute inset-x-0 top-0 h-1 ${styles.bar}`} aria-hidden />
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-3 text-2xl font-bold ${styles.value}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function FieldGroup({
  title,
  children,
  theme = "neutral",
}: {
  title: string;
  children: React.ReactNode;
  theme?: "neutral" | "target";
}) {
  const isTarget = theme === "target";
  return (
    <div
      className={`space-y-4 border-t border-slate-100 pt-5 first:border-t-0 first:pt-0 ${
        isTarget ? "-mx-3 rounded-2xl border-t-0 bg-emerald-50/40 px-3 py-4" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-3 w-1 rounded-full ${
            isTarget ? "bg-emerald-500" : "bg-slate-300"
          }`}
          aria-hidden
        />
        <h3
          className={`text-xs font-semibold uppercase tracking-wide ${
            isTarget ? "text-emerald-600" : "text-slate-400"
          }`}
        >
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">
        <InlineNumber value={value} onChange={onChange} />
      </div>
    </label>
  );
}

// Compact number input with the clear-while-typing fix (bare type=number snaps
// back to 0 on every keystroke).
function InlineNumber({
  value,
  onChange,
  step,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw === "" || raw === "-") {
            onChange(0);
            return;
          }
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        onBlur={() => setText(String(value))}
        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
      />
      {suffix && (
        <span className="shrink-0 text-xs font-medium text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  );
}
