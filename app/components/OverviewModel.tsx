"use client";

// Self-contained preview tab — splits the position into three focused views:
//   1. Company current valuation
//   2. Cactus Partners current stake
//   3. Company performance required to meet target (revenue only)
// Nothing here is shared with the Exit Model tab, so it can't affect it.

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Currency = "INR" | "USD";
type ValuationBasis = "blend" | "revenue" | "ebitda";

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
const signedPct = (value: number, digits = 1) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;

type SectorBenchmark = { revMultiple: number; ebitdaMultiple: number };

const SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {
  "Battery recycling / EV materials": { revMultiple: 3.5, ebitdaMultiple: 15 },
  "Consumer / D2C brands": { revMultiple: 3, ebitdaMultiple: 14 },
  "SaaS / customer experience": { revMultiple: 7, ebitdaMultiple: 26 },
};

type CompanyPreset = {
  name: string;
  sector: keyof typeof SECTOR_BENCHMARKS;
  totalInvestment: number;
  currentStake: number;
  currentYear: number;
  currentRevenue: number;
  currentEbitda: number;
  benchmarkRevMultiple: number;
  benchmarkEbitdaMultiple: number;
  overrideValuation: number;
  exitYear: number;
  targetRevenue: number;
  targetMultiple: number;
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
    benchmarkEbitdaMultiple: 18,
    overrideValuation: 0,
    exitYear: 2031,
    targetRevenue: 520,
    targetMultiple: 4,
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
    benchmarkEbitdaMultiple: 20,
    overrideValuation: 0,
    exitYear: 2030,
    targetRevenue: 240,
    targetMultiple: 4,
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
    benchmarkEbitdaMultiple: 28,
    overrideValuation: 0,
    exitYear: 2029,
    targetRevenue: 180,
    targetMultiple: 7,
  },
];

export default function OverviewModel() {
  const [valuationBasis, setValuationBasis] = useState<ValuationBasis>("blend");
  const [company, setCompany] = useState(PORTFOLIO[0].name);
  const [currency, setCurrency] = useState<Currency>("INR");
  const money = (v: number, d = 0) => formatMoney(v, currency, d);

  const initial = PORTFOLIO[0];
  const [totalInvestment, setTotalInvestment] = useState(initial.totalInvestment);
  const [currentStake, setCurrentStake] = useState(initial.currentStake);
  const [currentYear, setCurrentYear] = useState(initial.currentYear);
  const [currentRevenue, setCurrentRevenue] = useState(initial.currentRevenue);
  const [currentEbitda, setCurrentEbitda] = useState(initial.currentEbitda);
  const [benchmarkRevMultiple, setBenchmarkRevMultiple] = useState(
    initial.benchmarkRevMultiple
  );
  const [benchmarkEbitdaMultiple, setBenchmarkEbitdaMultiple] = useState(
    initial.benchmarkEbitdaMultiple
  );
  const [overrideValuation, setOverrideValuation] = useState(
    initial.overrideValuation
  );
  const [exitYear, setExitYear] = useState(initial.exitYear);
  const [targetRevenue, setTargetRevenue] = useState(initial.targetRevenue);
  const [targetMultiple, setTargetMultiple] = useState(initial.targetMultiple);

  const selectCompany = (name: string) => {
    const p = PORTFOLIO.find((c) => c.name === name);
    if (!p) return;
    setCompany(p.name);
    setTotalInvestment(p.totalInvestment);
    setCurrentStake(p.currentStake);
    setCurrentYear(p.currentYear);
    setCurrentRevenue(p.currentRevenue);
    setCurrentEbitda(p.currentEbitda);
    setBenchmarkRevMultiple(p.benchmarkRevMultiple);
    setBenchmarkEbitdaMultiple(p.benchmarkEbitdaMultiple);
    setOverrideValuation(p.overrideValuation);
    setExitYear(p.exitYear);
    setTargetRevenue(p.targetRevenue);
    setTargetMultiple(p.targetMultiple);
  };

  const sector =
    PORTFOLIO.find((c) => c.name === company)?.sector ?? PORTFOLIO[0].sector;
  const sectorBenchmark = SECTOR_BENCHMARKS[sector];

  const model = useMemo(() => {
    const revImplied = currentRevenue * benchmarkRevMultiple;
    const ebitdaImplied = currentEbitda * benchmarkEbitdaMultiple;
    const computed =
      valuationBasis === "revenue"
        ? revImplied
        : valuationBasis === "ebitda"
        ? ebitdaImplied
        : (revImplied + ebitdaImplied) / 2;
    const currentValuation = overrideValuation > 0 ? overrideValuation : computed;
    const currentValueOfInvestment = currentValuation * (currentStake / 100);
    const markup =
      totalInvestment > 0 ? currentValueOfInvestment / totalInvestment : 0;

    const years = Math.max(exitYear - currentYear, 0);
    const impliedCagr =
      years > 0 && currentRevenue > 0
        ? Math.pow(targetRevenue / currentRevenue, 1 / years) - 1
        : 0;

    const revenueSeries: { year: number; revenue: number; isExit: boolean }[] =
      [];
    for (let year = currentYear; year <= exitYear; year++) {
      const t = year - currentYear;
      const isExit = year === exitYear;
      const revenue = isExit
        ? targetRevenue
        : currentRevenue * Math.pow(1 + impliedCagr, t);
      revenueSeries.push({ year, revenue: Number(revenue.toFixed(1)), isExit });
    }

    const sectorRevPremium =
      sectorBenchmark.revMultiple > 0
        ? targetMultiple / sectorBenchmark.revMultiple - 1
        : 0;

    return {
      revImplied,
      ebitdaImplied,
      currentValuation,
      usingOverride: overrideValuation > 0,
      currentValueOfInvestment,
      markup,
      years,
      impliedCagr,
      revenueSeries,
      sectorRevPremium,
    };
  }, [
    currentRevenue,
    currentEbitda,
    benchmarkRevMultiple,
    benchmarkEbitdaMultiple,
    valuationBasis,
    overrideValuation,
    currentStake,
    totalInvestment,
    currentYear,
    exitYear,
    targetRevenue,
    targetMultiple,
    sectorBenchmark,
  ]);

  const valMax = Math.max(
    model.revImplied,
    model.ebitdaImplied,
    model.currentValuation,
    1
  );

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-lg font-bold text-white shadow-lg shadow-emerald-500/30">
              ◳
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Cactus Partners · Portfolio
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Position Overview
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

            <FieldGroup title="Current · financials & comps" theme="current">
              <SliderField
                label="Current year revenue"
                value={currentRevenue}
                onChange={setCurrentRevenue}
                min={1}
                max={1000}
                step={1}
                format={(v) => money(v)}
              />
              <SliderField
                label="Current year EBITDA"
                value={currentEbitda}
                onChange={setCurrentEbitda}
                min={-100}
                max={500}
                step={1}
                format={(v) => money(v)}
              />
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                {(
                  [
                    ["blend", "Blend"],
                    ["revenue", "Revenue"],
                    ["ebitda", "EBITDA"],
                  ] as const
                ).map(([key, labelText]) => (
                  <button
                    key={key}
                    onClick={() => setValuationBasis(key)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                      valuationBasis === key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {labelText}
                  </button>
                ))}
              </div>
              <SliderField
                label="Benchmark revenue multiple"
                value={benchmarkRevMultiple}
                onChange={setBenchmarkRevMultiple}
                min={0}
                max={30}
                step={0.1}
                format={mult}
              />
              <SliderField
                label="Benchmark EBITDA multiple"
                value={benchmarkEbitdaMultiple}
                onChange={setBenchmarkEbitdaMultiple}
                min={0}
                max={60}
                step={0.5}
                format={mult}
              />
              <NumberField
                label="Override valuation (0 = use comps)"
                value={overrideValuation}
                onChange={setOverrideValuation}
                suffix="₹ Cr"
              />
            </FieldGroup>

            <FieldGroup title="Position" theme="neutral">
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
            </FieldGroup>

            <FieldGroup title="Target" theme="target">
              <NumberField
                label="Current year"
                value={currentYear}
                onChange={setCurrentYear}
              />
              <NumberField
                label="Exit year"
                value={exitYear}
                onChange={setExitYear}
              />
              <SliderField
                label="Target revenue (at exit)"
                value={targetRevenue}
                onChange={setTargetRevenue}
                min={1}
                max={5000}
                step={5}
                format={(v) => money(v)}
              />
              <SliderField
                label="Target exit multiple (× revenue)"
                value={targetMultiple}
                onChange={setTargetMultiple}
                min={0}
                max={30}
                step={0.1}
                format={mult}
              />
            </FieldGroup>
          </aside>

          {/* ── Three views ─────────────────────────────────── */}
          <section className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Panel 1 — Company current valuation */}
              <Card>
                <CardHead
                  eyebrow="Now"
                  eyebrowTone="teal"
                  title="Company current valuation"
                />
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {money(model.currentValuation, 0)}
                </p>
                <div className="mt-5 space-y-4">
                  <MeasureBar
                    label="Revenue-implied"
                    value={model.revImplied}
                    max={valMax}
                    format={(v) => money(v, 0)}
                  />
                  <MeasureBar
                    label="EBITDA-implied"
                    value={model.ebitdaImplied}
                    max={valMax}
                    format={(v) => money(v, 0)}
                  />
                  <MeasureBar
                    label={
                      model.usingOverride
                        ? "Override (in use)"
                        : `In use · ${valuationBasis}`
                    }
                    value={model.currentValuation}
                    max={valMax}
                    format={(v) => money(v, 0)}
                    highlight
                  />
                </div>
              </Card>

              {/* Panel 2 — Cactus Partners current stake */}
              <Card>
                <CardHead
                  eyebrow="Now"
                  eyebrowTone="teal"
                  title="Cactus Partners current stake"
                />
                <div className="mt-3 flex items-center gap-5">
                  <div className="relative h-[120px] w-[120px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Cactus", value: currentStake },
                            { name: "Other", value: Math.max(100 - currentStake, 0) },
                          ]}
                          dataKey="value"
                          innerRadius={42}
                          outerRadius={58}
                          startAngle={90}
                          endAngle={-270}
                          stroke="none"
                        >
                          <Cell fill="#059669" />
                          <Cell fill="#e2e8f0" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-slate-900">
                        {pct(currentStake)}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        stake
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <StatRow
                      label="Value of investment"
                      value={money(model.currentValueOfInvestment, 1)}
                      emphasis
                    />
                    <StatRow
                      label="Invested (cost)"
                      value={money(totalInvestment, 0)}
                    />
                    <StatRow
                      label="Current markup"
                      value={`${model.markup.toFixed(2)}×`}
                      tone={model.markup >= 1 ? "up" : "down"}
                    />
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  <MeasureBar
                    label="Invested (cost)"
                    value={totalInvestment}
                    max={Math.max(totalInvestment, model.currentValueOfInvestment, 1)}
                    format={(v) => money(v, 0)}
                  />
                  <MeasureBar
                    label="Current stake value"
                    value={model.currentValueOfInvestment}
                    max={Math.max(totalInvestment, model.currentValueOfInvestment, 1)}
                    format={(v) => money(v, 0)}
                    highlight
                  />
                </div>
              </Card>
            </div>

            {/* Panel 3 — Required revenue performance */}
            <Card>
              <CardHead
                eyebrow="What's required"
                eyebrowTone="emerald"
                title="Company performance required to meet target"
              />
              <p className="mt-2 text-sm text-slate-600">
                Revenue must compound at{" "}
                <strong className="text-emerald-700">
                  {pct(model.impliedCagr * 100)}
                </strong>{" "}
                a year to reach{" "}
                <strong className="text-slate-900">
                  {money(targetRevenue, 0)}
                </strong>{" "}
                by {exitYear} ({model.years}y).
              </p>

              <div className="mt-4 h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={model.revenueSeries}
                    margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                      formatter={(value) => [money(Number(value), 1), "Revenue"]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        fontSize: 13,
                      }}
                    />
                    <ReferenceLine
                      x={exitYear}
                      stroke="#94a3b8"
                      strokeDasharray="5 5"
                      label={{
                        value: "Target",
                        position: "top",
                        fill: "#64748b",
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Required revenue"
                      stroke="#059669"
                      strokeWidth={3}
                      fill="url(#revFill)"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                    <ReferenceDot
                      x={exitYear}
                      y={Number(targetRevenue.toFixed(1))}
                      r={5}
                      fill="#059669"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    Target exit multiple vs sector
                  </span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      model.sectorRevPremium >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {signedPct(model.sectorRevPremium * 100, 0)} vs sector
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  <MeasureBar
                    label="Your target multiple"
                    value={targetMultiple}
                    max={Math.max(targetMultiple, sectorBenchmark.revMultiple, 1)}
                    format={mult}
                    highlight
                  />
                  <MeasureBar
                    label={`Sector average · ${sector}`}
                    value={sectorBenchmark.revMultiple}
                    max={Math.max(targetMultiple, sectorBenchmark.revMultiple, 1)}
                    format={mult}
                  />
                </div>
              </div>
            </Card>
          </section>
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          Preview tab · illustrative model · not investment advice
        </footer>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
      {children}
    </div>
  );
}

function CardHead({
  eyebrow,
  eyebrowTone,
  title,
}: {
  eyebrow: string;
  eyebrowTone: "teal" | "emerald";
  title: string;
}) {
  return (
    <div>
      <span
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          eyebrowTone === "emerald" ? "text-emerald-700" : "text-teal-700"
        }`}
      >
        {eyebrow}
      </span>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    </div>
  );
}

function MeasureBar({
  label,
  value,
  max,
  format,
  highlight,
}: {
  label: string;
  value: number;
  max: number;
  format: (value: number) => string;
  highlight?: boolean;
}) {
  const width = max > 0 ? Math.max((value / max) * 100, 1.5) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {format(value)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${
            highlight ? "bg-emerald-500" : "bg-slate-300"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "up" | "down";
}) {
  const toneClass =
    tone === "up"
      ? "text-emerald-600"
      : tone === "down"
      ? "text-rose-600"
      : emphasis
      ? "text-emerald-600"
      : "text-slate-900";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`tabular-nums ${
          emphasis ? "text-base font-bold" : "text-sm font-semibold"
        } ${toneClass}`}
      >
        {value}
      </span>
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
  theme?: "neutral" | "current" | "target";
}) {
  const isTarget = theme === "target";
  const headerColor =
    theme === "target"
      ? "text-emerald-600"
      : theme === "current"
      ? "text-teal-700"
      : "text-slate-400";
  return (
    <div
      className={`space-y-4 border-t border-slate-100 pt-5 first:border-t-0 first:pt-0 ${
        isTarget ? "-mx-3 rounded-2xl border-t-0 bg-emerald-50/40 px-3 py-4" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-3 w-1 rounded-full ${
            theme === "target"
              ? "bg-emerald-500"
              : theme === "current"
              ? "bg-teal-500"
              : "bg-slate-300"
          }`}
          aria-hidden
        />
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${headerColor}`}>
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
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
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
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
        />
        {suffix && (
          <span className="shrink-0 text-xs font-medium text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
