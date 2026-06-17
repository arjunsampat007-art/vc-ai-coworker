"use client";

import { useMemo, useState } from "react";
import OverviewModel from "./components/OverviewModel";
import PhasedExitModel from "./components/PhasedExitModel";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ViewMode = "graph" | "table";
type ValuationBasis = "blend" | "revenue" | "ebitda";
type ExitType = "Strategic Sale" | "IPO" | "Secondary Sale";

type SectorBenchmark = {
  revMultiple: number;
  ebitdaMultiple: number;
};

// Sector averages — the benchmark a company's target is judged against.
const SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {
  "Battery recycling / EV materials": { revMultiple: 3.5, ebitdaMultiple: 15 },
  "Consumer / D2C brands": { revMultiple: 3, ebitdaMultiple: 14 },
  "SaaS / customer experience": { revMultiple: 7, ebitdaMultiple: 26 },
};

type Round = { year: number; dilutionPct: number };

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
  exitType: ExitType;
  exitYear: number;
  // ── main targets ──
  targetRevenue: number;
  targetStake: number; // exit-stake override; 0 = derive from dilution rounds
  targetMultiple: number;
  // ── future funding rounds that dilute the stake ──
  rounds: Round[];
};

// Portfolio companies — each preset hydrates the whole model.
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
    exitType: "Strategic Sale",
    exitYear: 2031,
    targetRevenue: 520,
    targetStake: 0,
    targetMultiple: 4,
    rounds: [
      { year: 2028, dilutionPct: 10 },
      { year: 2030, dilutionPct: 10 },
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
    benchmarkEbitdaMultiple: 20,
    overrideValuation: 0,
    exitType: "Secondary Sale",
    exitYear: 2030,
    targetRevenue: 240,
    targetStake: 0,
    targetMultiple: 4,
    rounds: [
      { year: 2028, dilutionPct: 12 },
      { year: 2029, dilutionPct: 9 },
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
    benchmarkEbitdaMultiple: 28,
    overrideValuation: 0,
    exitType: "IPO",
    exitYear: 2029,
    targetRevenue: 180,
    targetStake: 0,
    targetMultiple: 7,
    rounds: [
      { year: 2027, dilutionPct: 9 },
      { year: 2028, dilutionPct: 8 },
    ],
  },
];

type Currency = "INR" | "USD";

// Model math is in ₹ crore. 1 Cr = 10M INR; convert to $M at a fixed rate.
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

type YearPoint = {
  year: number;
  revenue: number;
  ebitda: number;
  valuation: number;
  trendValuation: number; // today's value grown at revenue CAGR, no re-rating
  stakeValue: number | null; // null after exit — Cactus Partners has sold out
  isExit: boolean;
};

export default function Home() {
  const [tab, setTab] = useState<"exit" | "overview" | "phased">("exit");
  return (
    <>
      <div className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#f5f8f6]/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-2.5 sm:px-6 lg:px-10">
          {(
            [
              ["exit", "Exit Model", false],
              ["overview", "Position Overview", true],
              ["phased", "Phased Exit", true],
            ] as const
          ).map(([key, labelText, isPreview]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                tab === key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {labelText}
              {isPreview && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    tab === key
                      ? "bg-white/20 text-white"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  preview
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {tab === "exit" ? (
        <ExitModel />
      ) : tab === "overview" ? (
        <OverviewModel />
      ) : (
        <PhasedExitModel />
      )}
    </>
  );
}

function ExitModel() {
  const [viewMode, setViewMode] = useState<ViewMode>("graph");
  const [valuationBasis, setValuationBasis] = useState<ValuationBasis>("blend");

  const [company, setCompany] = useState(PORTFOLIO[0].name);
  const [currentSource, setCurrentSource] = useState<"data" | "manual">("data");
  const [currency, setCurrency] = useState<Currency>("INR");
  const money = (valueCr: number, digits = 0) =>
    formatMoney(valueCr, currency, digits);
  const initial = PORTFOLIO[0];

  // ── Position ──────────────────────────────────────────────
  const [totalInvestment, setTotalInvestment] = useState(initial.totalInvestment);
  const [currentStake, setCurrentStake] = useState(initial.currentStake);

  // Stake can be entered as a % or as a share count ÷ shares outstanding.
  const [stakeMode, setStakeMode] = useState<"percent" | "shares">("percent");
  const [sharesOutstanding, setSharesOutstanding] = useState(10_000_000);
  const [sharesHeld, setSharesHeld] = useState(
    (initial.currentStake / 100) * 10_000_000
  );
  const setHeld = (v: number) => {
    setSharesHeld(v);
    if (sharesOutstanding > 0) setCurrentStake((v / sharesOutstanding) * 100);
  };
  const setOutstanding = (v: number) => {
    setSharesOutstanding(v);
    if (v > 0) setCurrentStake((sharesHeld / v) * 100);
  };
  const enableSharesMode = () => {
    setSharesHeld((currentStake / 100) * sharesOutstanding);
    setStakeMode("shares");
  };

  // ── Current-year financials ───────────────────────────────
  const [currentYear, setCurrentYear] = useState(initial.currentYear);
  const [currentRevenue, setCurrentRevenue] = useState(initial.currentRevenue);
  const [currentEbitda, setCurrentEbitda] = useState(initial.currentEbitda);

  // ── Today's valuation comps ───────────────────────────────
  const [benchmarkRevMultiple, setBenchmarkRevMultiple] = useState(
    initial.benchmarkRevMultiple
  );
  const [benchmarkEbitdaMultiple, setBenchmarkEbitdaMultiple] = useState(
    initial.benchmarkEbitdaMultiple
  );
  const [overrideValuation, setOverrideValuation] = useState(
    initial.overrideValuation
  ); // 0 → use computed

  // ── Main targets ──────────────────────────────────────────
  const [exitType, setExitType] = useState<ExitType>(initial.exitType);
  const [exitYear, setExitYear] = useState(initial.exitYear);
  const [targetRevenue, setTargetRevenue] = useState(initial.targetRevenue);
  const [targetStake, setTargetStake] = useState(initial.targetStake);
  const [targetMultiple, setTargetMultiple] = useState(initial.targetMultiple);
  const [rounds, setRounds] = useState<Round[]>(initial.rounds);

  const selectCompany = (name: string) => {
    const preset = PORTFOLIO.find((c) => c.name === name);
    if (!preset) return;
    setCompany(preset.name);
    setTotalInvestment(preset.totalInvestment);
    setCurrentStake(preset.currentStake);
    setSharesHeld((preset.currentStake / 100) * sharesOutstanding);
    setCurrentYear(preset.currentYear);
    setCurrentRevenue(preset.currentRevenue);
    setCurrentEbitda(preset.currentEbitda);
    setBenchmarkRevMultiple(preset.benchmarkRevMultiple);
    setBenchmarkEbitdaMultiple(preset.benchmarkEbitdaMultiple);
    setOverrideValuation(preset.overrideValuation);
    setExitType(preset.exitType);
    setExitYear(preset.exitYear);
    setTargetRevenue(preset.targetRevenue);
    setTargetStake(preset.targetStake);
    setTargetMultiple(preset.targetMultiple);
    setRounds(preset.rounds);
  };

  const updateRound = (index: number, patch: Partial<Round>) =>
    setRounds((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const removeRound = (index: number) =>
    setRounds((prev) => prev.filter((_, i) => i !== index));
  const addRound = () =>
    setRounds((prev) => {
      const lastYear = prev.length ? prev[prev.length - 1].year : currentYear;
      return [
        ...prev,
        { year: Math.min(lastYear + 1, exitYear), dilutionPct: 10 },
      ];
    });

  const pullCurrentFromData = () => {
    const preset = PORTFOLIO.find((c) => c.name === company);
    if (!preset) return;
    setCurrentYear(preset.currentYear);
    setCurrentRevenue(preset.currentRevenue);
    setCurrentEbitda(preset.currentEbitda);
    setBenchmarkRevMultiple(preset.benchmarkRevMultiple);
    setBenchmarkEbitdaMultiple(preset.benchmarkEbitdaMultiple);
    setOverrideValuation(preset.overrideValuation);
  };

  const lockCurrent = currentSource === "data";

  const sector =
    PORTFOLIO.find((c) => c.name === company)?.sector ??
    PORTFOLIO[0].sector;
  const sectorBenchmark = SECTOR_BENCHMARKS[sector];

  const model = useMemo(() => {
    const margin = currentRevenue > 0 ? currentEbitda / currentRevenue : 0;
    const years = Math.max(exitYear - currentYear, 0);

    // Growth implied by getting from current to target revenue.
    const impliedCagr =
      years > 0 && currentRevenue > 0
        ? Math.pow(targetRevenue / currentRevenue, 1 / years) - 1
        : 0;

    const valueByBasis = (
      rev: number,
      ebitda: number,
      rm: number,
      em: number
    ) => {
      const byRev = rev * rm;
      const byEbitda = ebitda * em;
      if (valuationBasis === "revenue") return byRev;
      if (valuationBasis === "ebitda") return byEbitda;
      return (byRev + byEbitda) / 2;
    };

    // Current valuation (today's comps); override wins if provided.
    const computedCurrentValuation = valueByBasis(
      currentRevenue,
      currentEbitda,
      benchmarkRevMultiple,
      benchmarkEbitdaMultiple
    );
    const currentValuation =
      overrideValuation > 0 ? overrideValuation : computedCurrentValuation;
    const currentValueOfInvestment = currentValuation * (currentStake / 100);

    // Dilution: each round multiplies the stake by (1 − dilution%). The exit
    // stake is derived from rounds up to exit, unless an override is set.
    const dilutionFactorTo = (year: number) =>
      rounds
        .filter((r) => r.year <= year)
        .reduce((acc, r) => acc * (1 - Math.max(r.dilutionPct, 0) / 100), 1);
    const dilutedExitStake = currentStake * dilutionFactorTo(exitYear);
    const effectiveExitStake = targetStake > 0 ? targetStake : dilutedExitStake;

    // Target exit — set directly from the main targets.
    const exitEbitda = targetRevenue * margin;
    const exitValuation = targetRevenue * targetMultiple;
    const exitCplValue = exitValuation * (effectiveExitStake / 100);

    const moic = totalInvestment > 0 ? exitCplValue / totalInvestment : 0;
    const forwardIrr =
      years > 0 && currentValueOfInvestment > 0
        ? Math.pow(exitCplValue / currentValueOfInvestment, 1 / years) - 1
        : 0;

    // Implied multiples on a consistent trailing basis (valuation ÷ financials).
    const currentImpliedRevMultiple =
      currentRevenue > 0 ? currentValuation / currentRevenue : 0;
    const currentImpliedEbitdaMultiple =
      currentEbitda > 0 ? currentValuation / currentEbitda : 0;
    const exitImpliedEbitdaMultiple =
      exitEbitda > 0 ? exitValuation / exitEbitda : 0;

    // Sector comparison — your target exit multiple vs the sector average.
    const sectorRevPremium =
      sectorBenchmark.revMultiple > 0
        ? targetMultiple / sectorBenchmark.revMultiple - 1
        : 0;

    // Current-trend projection: grow today's valuation at the revenue CAGR with
    // NO multiple re-rating, and find when it crosses the target value. If the
    // target multiple is above today's, the trend reaches it later than planned
    // (the plan relies on re-rating); below, it gets there sooner.
    const trendRatio = currentValuation > 0 ? exitValuation / currentValuation : 0;
    const trendCrossT =
      trendRatio <= 1
        ? 0
        : impliedCagr > 0
        ? Math.log(trendRatio) / Math.log(1 + impliedCagr)
        : null;
    const projectedTrendYear =
      trendCrossT === null ? null : currentYear + trendCrossT;

    // Per-year trajectory. Valuation (blue) runs a smooth geometric path from
    // today's mark to the exit valuation, so both ends match the KPI cards;
    // it carries one year past exit for context. The stake (black) ramps from
    // current to target ownership and then ends — Cactus Partners has exited.
    const series: YearPoint[] = [];
    for (let year = currentYear; year <= exitYear + 1; year++) {
      const t = year - currentYear;
      const isExit = year === exitYear;
      const postExit = year > exitYear;

      const rev = currentRevenue * Math.pow(1 + impliedCagr, t);
      const ebitda = rev * margin;

      const valuation =
        currentValuation > 0 && exitValuation > 0 && years > 0
          ? currentValuation *
            Math.pow(exitValuation / currentValuation, t / years)
          : currentValuation;

      // Stake over time: stepwise dilution from rounds, or a linear ramp to the
      // override when one is set.
      const stake =
        targetStake > 0
          ? currentStake +
            (targetStake - currentStake) *
              (years > 0 ? Math.min(t / years, 1) : 0)
          : currentStake * dilutionFactorTo(year);

      const trendValuation = currentValuation * Math.pow(1 + impliedCagr, t);

      series.push({
        year,
        revenue: Number(rev.toFixed(1)),
        ebitda: Number(ebitda.toFixed(1)),
        valuation: Number(valuation.toFixed(1)),
        trendValuation: Number(trendValuation.toFixed(1)),
        stakeValue: postExit
          ? null
          : Number((valuation * (stake / 100)).toFixed(1)),
        isExit,
      });
    }

    return {
      margin,
      years,
      impliedCagr,
      currentValuation,
      currentValueOfInvestment,
      usingOverride: overrideValuation > 0,
      exitEbitda,
      exitValuation,
      exitCplValue,
      dilutedExitStake,
      effectiveExitStake,
      usingStakeOverride: targetStake > 0,
      moic,
      forwardIrr,
      currentImpliedRevMultiple,
      currentImpliedEbitdaMultiple,
      exitImpliedEbitdaMultiple,
      sectorRevPremium,
      projectedTrendYear,
      series,
    };
  }, [
    currentRevenue,
    currentEbitda,
    currentYear,
    valuationBasis,
    benchmarkRevMultiple,
    benchmarkEbitdaMultiple,
    overrideValuation,
    currentStake,
    exitYear,
    targetRevenue,
    targetStake,
    targetMultiple,
    totalInvestment,
    rounds,
    sectorBenchmark,
  ]);

  // ── Exit diagnostic: which lever is dragging returns the most ──
  // MOIC = (targetRevenue × targetMultiple × targetStake) / totalInvestment.
  // Score each lever against a reference; the lowest ratio is the weak link.
  const HURDLE_MOIC = 3;
  const missingExit = model.moic < HURDLE_MOIC;
  const CAGR_REFERENCE = 0.25;
  const drivers = [
    {
      key: "Exit multiple",
      ratio:
        sectorBenchmark.revMultiple > 0
          ? targetMultiple / sectorBenchmark.revMultiple
          : 1,
      detail: `your ${mult(targetMultiple)} target exit multiple is ${signedPct(
        model.sectorRevPremium * 100,
        0
      )} vs the ${mult(sectorBenchmark.revMultiple)} sector average`,
    },
    {
      key: "Stake dilution",
      ratio: currentStake > 0 ? model.effectiveExitStake / currentStake : 1,
      detail: `your stake dilutes from ${pct(currentStake)} today to ${pct(
        model.effectiveExitStake
      )} at exit`,
    },
    {
      key: "Revenue growth",
      ratio: model.impliedCagr / CAGR_REFERENCE,
      detail: `revenue compounds at just ${pct(
        model.impliedCagr * 100
      )} CAGR to your ${money(targetRevenue)} target`,
    },
  ];
  const worstDriver = drivers.reduce((a, b) => (b.ratio < a.ratio ? b : a));

  // Projected-exit (current trend) badge vs the planned exit year.
  const projectedYear = model.projectedTrendYear;
  const trendDelta = projectedYear === null ? null : projectedYear - exitYear;
  const trendStatus =
    trendDelta === null
      ? "Out of reach"
      : Math.abs(trendDelta) < 0.5
      ? "On time"
      : trendDelta < 0
      ? "Ahead"
      : "Late";
  const trendStatusTone =
    trendStatus === "Ahead"
      ? "bg-emerald-100 text-emerald-700"
      : trendStatus === "On time"
      ? "bg-teal-100 text-teal-700"
      : "bg-rose-100 text-rose-700";
  const trendBadge =
    projectedYear === null
      ? "Current trend never reaches the target"
      : `Current trend reaches target in ${Math.round(projectedYear)}` +
        (trendStatus === "On time"
          ? " · on time"
          : ` · ${Math.abs(Math.round(trendDelta!))}y ${
              trendDelta! < 0 ? "early" : "late"
            } vs ${exitYear}`);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-lg font-bold text-white shadow-lg shadow-emerald-500/30">
              ↗
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Cactus Partners · Portfolio
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Investment & Exit Model
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
                onChange={(event) => selectCompany(event.target.value)}
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
            <div className="flex items-center gap-2 self-end">
              <div className="flex rounded-full border border-slate-200 bg-white/70 p-1 shadow-sm backdrop-blur">
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
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                {exitType} · {exitYear}
              </div>
            </div>
            <p className="self-end text-[11px] text-slate-400">
              {currency === "USD"
                ? `Converted at ₹${INR_PER_USD}/$1 · ₹1 Cr = $${CR_TO_USD_M.toFixed(
                    2
                  )}M`
                : "All values in ₹ crore"}
            </p>
          </div>
        </header>

        {/* ── Headline results (all computed) ───────────────── */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Current · value of investment"
            value={money(model.currentValueOfInvestment, 1)}
            detail={`${pct(currentStake)} of ${money(model.currentValuation, 0)}`}
            tone="info"
          />
          <MetricCard
            label="Target · Cactus Partners exit value"
            value={money(model.exitCplValue, 1)}
            detail={`${pct(model.effectiveExitStake)} of ${money(
              model.exitValuation,
              0
            )} at exit`}
            tone="neutral"
          />
          <MetricCard
            label="MOIC"
            value={`${model.moic.toFixed(2)}×`}
            detail={`on ${money(totalInvestment)} invested`}
            tone={model.moic >= 1 ? "success" : "danger"}
          />
          <MetricCard
            label="Forward IRR"
            value={pct(model.forwardIrr * 100, 1)}
            detail={`over ${model.years}y to exit`}
            tone={model.forwardIrr >= 0 ? "success" : "danger"}
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

            <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                Current data source
              </span>
              <div className="mt-2 flex rounded-lg border border-teal-200 bg-white p-1">
                {(
                  [
                    ["data", "From company data"],
                    ["manual", "Manual"],
                  ] as const
                ).map(([key, labelText]) => (
                  <button
                    key={key}
                    onClick={() => setCurrentSource(key)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                      currentSource === key
                        ? "bg-teal-600 text-white shadow-sm"
                        : "text-teal-700 hover:bg-teal-50"
                    }`}
                  >
                    {labelText}
                  </button>
                ))}
              </div>
              {currentSource === "data" ? (
                <p className="mt-2 text-[11px] leading-relaxed text-teal-700/80">
                  Current financials &amp; comps are synced from {company}&apos;s
                  record. Switch to Manual to edit them.
                </p>
              ) : (
                <button
                  onClick={pullCurrentFromData}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-teal-200 bg-white px-2 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
                >
                  ↻ Re-sync current from {company} data
                </button>
              )}
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
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    Current stake
                  </span>
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {(
                      [
                        ["percent", "%"],
                        ["shares", "Shares"],
                      ] as const
                    ).map(([key, labelText]) => (
                      <button
                        key={key}
                        onClick={() =>
                          key === "shares"
                            ? enableSharesMode()
                            : setStakeMode("percent")
                        }
                        className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                          stakeMode === key
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {labelText}
                      </button>
                    ))}
                  </div>
                </div>

                {stakeMode === "percent" ? (
                  <SliderField
                    label=""
                    value={currentStake}
                    onChange={setCurrentStake}
                    min={0}
                    max={100}
                    step={0.5}
                    format={(v) => pct(v)}
                  />
                ) : (
                  <div className="mt-2 space-y-2">
                    <NumberField
                      label="Shares held"
                      value={Math.round(sharesHeld)}
                      onChange={setHeld}
                    />
                    <NumberField
                      label="Shares outstanding"
                      value={Math.round(sharesOutstanding)}
                      onChange={setOutstanding}
                    />
                    <p className="text-xs text-slate-400">
                      = <strong className="text-slate-600">{pct(currentStake)}</strong>{" "}
                      stake.
                    </p>
                  </div>
                )}
              </div>
            </FieldGroup>

            <FieldGroup title="Current · financials" theme="current">
              <NumberField
                label="Current year"
                value={currentYear}
                onChange={setCurrentYear}
                disabled={lockCurrent}
              />
              <SliderField
                label="Current year revenue"
                value={currentRevenue}
                onChange={setCurrentRevenue}
                min={1}
                max={1000}
                step={1}
                format={(v) => money(v)}
                disabled={lockCurrent}
              />
              <SliderField
                label="Current year EBITDA"
                value={currentEbitda}
                onChange={setCurrentEbitda}
                min={-100}
                max={500}
                step={1}
                format={(v) => money(v)}
                disabled={lockCurrent}
              />
              <p className="text-xs text-slate-400">
                EBITDA margin held at {pct(model.margin * 100)} of revenue.
              </p>
            </FieldGroup>

            <FieldGroup title="Current · valuation comps" theme="current">
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
                disabled={lockCurrent}
              />
              <SliderField
                label="Benchmark EBITDA multiple"
                value={benchmarkEbitdaMultiple}
                onChange={setBenchmarkEbitdaMultiple}
                min={0}
                max={60}
                step={0.5}
                format={mult}
                disabled={lockCurrent}
              />
              <NumberField
                label="Override valuation (0 = use comps)"
                value={overrideValuation}
                onChange={setOverrideValuation}
                suffix="₹ Cr"
                disabled={lockCurrent}
              />
            </FieldGroup>

            <FieldGroup title="Main targets" theme="target">
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
                label="Exit stake override (0 = from rounds)"
                value={targetStake}
                onChange={setTargetStake}
                min={0}
                max={100}
                step={0.5}
                format={(v) => (v > 0 ? pct(v) : "from rounds")}
              />
              <p className="text-xs text-slate-400">
                Exit stake{" "}
                {model.usingStakeOverride ? "(override)" : "(from rounds)"}:{" "}
                <strong className="text-slate-600">
                  {pct(model.effectiveExitStake)}
                </strong>
                .
              </p>
              <SliderField
                label="Target exit multiple (× revenue)"
                value={targetMultiple}
                onChange={setTargetMultiple}
                min={0}
                max={30}
                step={0.1}
                format={mult}
              />
              <p className="text-xs text-slate-400">
                Implies {pct(model.impliedCagr * 100)} revenue CAGR ·{" "}
                {signedPct(model.sectorRevPremium * 100, 0)} vs{" "}
                {mult(sectorBenchmark.revMultiple)} sector avg.
              </p>
              <SelectField
                label="Exit type"
                value={exitType}
                onChange={(v) => setExitType(v as ExitType)}
                options={["Strategic Sale", "IPO", "Secondary Sale"]}
              />
              <NumberField
                label="Exit year"
                value={exitYear}
                onChange={setExitYear}
              />
            </FieldGroup>

            <FieldGroup title="Funding rounds (dilution)">
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Year</span>
                <span>Dilution</span>
                <span />
              </div>
              {rounds.length === 0 && (
                <p className="text-xs text-slate-400">
                  No rounds — stake stays at {pct(currentStake)} to exit.
                </p>
              )}
              {rounds.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_auto] items-center gap-x-2"
                >
                  <MiniNumber
                    value={r.year}
                    onChange={(v) => updateRound(i, { year: v })}
                  />
                  <MiniNumber
                    value={r.dilutionPct}
                    step={1}
                    suffix="%"
                    onChange={(v) => updateRound(i, { dilutionPct: v })}
                  />
                  <button
                    onClick={() => removeRound(i)}
                    className="justify-self-end rounded-lg px-2 py-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove round"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={addRound}
                className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                + Add round
              </button>
              <p className="text-xs text-slate-400">
                Dilutes {pct(currentStake)} →{" "}
                <strong className="text-slate-600">
                  {pct(model.dilutedExitStake)}
                </strong>{" "}
                by {exitYear}
                {model.usingStakeOverride && " (currently overridden above)"}.
              </p>
            </FieldGroup>
          </aside>

          {/* ── Chart / table ───────────────────────────────── */}
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Valuation & Stake Trajectory
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Green area = whole company (left axis) · dark line = Cactus
                    Partners&apos; stake (right axis) · amber line = invested
                    capital — the gap to it is your MOIC
                  </p>
                  <span
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${trendStatusTone}`}
                  >
                    <span aria-hidden>◔</span>
                    {trendBadge}
                  </span>
                </div>

                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {(["graph", "table"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
                        viewMode === mode
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {viewMode === "graph" ? (
                <div className="mt-6 h-[420px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={model.series}
                      margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="valFill" x1="0" y1="0" x2="0" y2="1">
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
                        yAxisId="left"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#059669", fontSize: 12 }}
                        width={64}
                        tickFormatter={(value) =>
                          currency === "USD"
                            ? `$${(value * CR_TO_USD_M).toFixed(0)}`
                            : `₹${value}`
                        }
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#0f172a", fontSize: 12 }}
                        width={64}
                        tickFormatter={(value) =>
                          currency === "USD"
                            ? `$${(value * CR_TO_USD_M).toFixed(0)}`
                            : `₹${value}`
                        }
                      />
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Legend
                        iconType="plainline"
                        wrapperStyle={{ paddingTop: 12, fontSize: 13 }}
                      />
                      <ReferenceLine
                        yAxisId="left"
                        x={exitYear}
                        stroke="#94a3b8"
                        strokeDasharray="5 5"
                        label={{
                          value: "Target exit",
                          position: "top",
                          fill: "#64748b",
                          fontSize: 11,
                        }}
                      />
                      <ReferenceLine
                        yAxisId="right"
                        y={totalInvestment}
                        ifOverflow="extendDomain"
                        stroke="#b45309"
                        strokeDasharray="6 4"
                        label={{
                          value: `Invested ${money(totalInvestment)}`,
                          position: "insideBottomRight",
                          fill: "#b45309",
                          fontSize: 11,
                        }}
                      />
                      <ReferenceLine
                        yAxisId="left"
                        y={Number(model.exitValuation.toFixed(1))}
                        stroke="#64748b"
                        strokeDasharray="2 3"
                        label={{
                          value: "Target value",
                          position: "insideTopLeft",
                          fill: "#64748b",
                          fontSize: 11,
                        }}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="valuation"
                        name="Company valuation (left axis)"
                        stroke="#059669"
                        strokeWidth={3}
                        fill="url(#valFill)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="trendValuation"
                        name="Current trend (no re-rating)"
                        stroke="#0d9488"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="stakeValue"
                        name="Cactus Partners stake (right axis)"
                        stroke="#0f172a"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                      <ReferenceDot
                        yAxisId="left"
                        x={exitYear}
                        y={Number(model.exitValuation.toFixed(1))}
                        r={5}
                        fill="#059669"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Year</th>
                        <th className="px-4 py-3 font-semibold">Revenue</th>
                        <th className="px-4 py-3 font-semibold">EBITDA</th>
                        <th className="px-4 py-3 font-semibold">Valuation</th>
                        <th className="px-4 py-3 font-semibold">Stake value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.series.map((point) => (
                        <tr
                          key={point.year}
                          className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                            point.isExit ? "bg-emerald-50/50" : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {point.year}
                            {point.isExit && (
                              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                EXIT
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {money(point.revenue, 1)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {money(point.ebitda, 1)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {money(point.valuation, 1)}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {point.stakeValue === null ? (
                              <span className="text-slate-400">Exited</span>
                            ) : (
                              money(point.stakeValue, 1)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Current → Target variance ─────────────────── */}
            <VariancePanel
              rows={[
                {
                  label: "Company valuation",
                  current: money(model.currentValuation, 0),
                  target: money(model.exitValuation, 0),
                  delta: model.exitValuation - model.currentValuation,
                  format: (v) => money(v, 0),
                },
                {
                  label: "Your position value",
                  current: money(model.currentValueOfInvestment, 1),
                  target: money(model.exitCplValue, 1),
                  delta: model.exitCplValue - model.currentValueOfInvestment,
                  format: (v) => money(v, 1),
                },
                {
                  label: "Your stake",
                  current: pct(currentStake),
                  target: pct(model.effectiveExitStake),
                  delta: model.effectiveExitStake - currentStake,
                  format: (v) => `${v >= 0 ? "+" : ""}${pct(v)}`,
                },
                {
                  label: "Revenue",
                  current: money(currentRevenue, 0),
                  target: money(targetRevenue, 0),
                  delta: targetRevenue - currentRevenue,
                  format: (v) => money(v, 0),
                },
                {
                  label: "EBITDA",
                  current: money(currentEbitda, 0),
                  target: money(model.exitEbitda, 0),
                  delta: model.exitEbitda - currentEbitda,
                  format: (v) => money(v, 0),
                },
                {
                  label: "Implied revenue multiple (trailing)",
                  current: mult(model.currentImpliedRevMultiple),
                  target: mult(targetMultiple),
                  delta: targetMultiple - model.currentImpliedRevMultiple,
                  format: (v) => `${v >= 0 ? "+" : ""}${mult(v)}`,
                },
                {
                  label: "Implied EBITDA multiple (trailing)",
                  current: mult(model.currentImpliedEbitdaMultiple),
                  target: mult(model.exitImpliedEbitdaMultiple),
                  delta:
                    model.exitImpliedEbitdaMultiple -
                    model.currentImpliedEbitdaMultiple,
                  format: (v) => `${v >= 0 ? "+" : ""}${mult(v)}`,
                },
              ]}
            />

            {/* ── Breakdown cards ───────────────────────────── */}
            <div className="grid gap-6 sm:grid-cols-2">
              <BreakdownCard title="Current · valuation">
                <StatRow
                  label="Revenue-implied"
                  value={money(currentRevenue * benchmarkRevMultiple, 0)}
                />
                <StatRow
                  label="EBITDA-implied"
                  value={money(currentEbitda * benchmarkEbitdaMultiple, 0)}
                />
                <StatRow
                  label={
                    model.usingOverride
                      ? "Override (in use)"
                      : valuationBasis === "revenue"
                      ? "Revenue comps"
                      : valuationBasis === "ebitda"
                      ? "EBITDA comps"
                      : "Comps blend"
                  }
                  value={money(model.currentValuation, 0)}
                  emphasis
                />
              </BreakdownCard>

              <BreakdownCard title="Target · exit valuation">
                <StatRow label="Target revenue" value={money(targetRevenue, 0)} />
                <StatRow label="× Target multiple" value={mult(targetMultiple)} />
                <StatRow
                  label="= Exit valuation"
                  value={money(model.exitValuation, 0)}
                  emphasis
                />
              </BreakdownCard>

              <BreakdownCard title={`Sector benchmark · ${sector}`}>
                <StatRow
                  label="Sector avg revenue multiple"
                  value={mult(sectorBenchmark.revMultiple)}
                />
                <StatRow
                  label="Your target multiple"
                  value={mult(targetMultiple)}
                />
                <StatRow
                  label="Premium / discount to sector"
                  value={signedPct(model.sectorRevPremium * 100, 0)}
                  tone={model.sectorRevPremium >= 0 ? "up" : "down"}
                  emphasis
                />
                <p className="pt-1 text-xs text-slate-400">
                  Sector avg EBITDA multiple {mult(sectorBenchmark.ebitdaMultiple)}{" "}
                  vs your {mult(model.exitImpliedEbitdaMultiple)} implied.
                </p>
              </BreakdownCard>

              <BreakdownCard title="Return summary">
                <StatRow label="MOIC" value={`${model.moic.toFixed(2)}×`} />
                <StatRow
                  label="Forward IRR"
                  value={pct(model.forwardIrr * 100, 1)}
                  tone={model.forwardIrr >= 0 ? "up" : "down"}
                />
                <StatRow label="Holding period" value={`${model.years} years`} />
                <StatRow
                  label="Implied revenue CAGR"
                  value={pct(model.impliedCagr * 100)}
                />
              </BreakdownCard>
            </div>
          </section>
        </section>

        {/* ── Exit diagnostic ───────────────────────────────── */}
        <section
          className={`mt-6 rounded-3xl border p-6 shadow-sm ${
            missingExit
              ? "border-rose-100 bg-gradient-to-br from-rose-50/80 to-amber-50/60"
              : "border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-teal-50/60"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white ${
                missingExit ? "bg-rose-600" : "bg-emerald-600"
              }`}
            >
              {missingExit ? "!" : "✓"}
            </span>
            <h2 className="text-base font-semibold text-slate-900">
              Exit diagnostic
            </h2>
            <span className="ml-auto text-xs font-medium text-slate-500">
              MOIC {model.moic.toFixed(2)}× vs {HURDLE_MOIC.toFixed(1)}× hurdle
            </span>
          </div>

          <p
            className={`mt-4 flex gap-2 text-base font-semibold ${
              missingExit ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            <span aria-hidden>•</span>
            <span>
              Biggest drag on the exit:{" "}
              <span className="underline decoration-2 underline-offset-2">
                {worstDriver.key}
              </span>{" "}
              — {worstDriver.detail}.
            </span>
          </p>

          <p className="mt-2 text-sm text-slate-600">
            {missingExit
              ? `At a ${model.moic.toFixed(
                  2
                )}× MOIC the position lands below the ${HURDLE_MOIC.toFixed(
                  1
                )}× hurdle. Lift the lever above first — it moves returns most per unit of change.`
              : `The position clears the ${HURDLE_MOIC.toFixed(
                  1
                )}× hurdle at ${model.moic.toFixed(
                  2
                )}× MOIC. ${worstDriver.key} is still the weakest lever to watch.`}
          </p>
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          Illustrative model · not investment advice
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

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

function MetricCard({ label, value, detail, tone }: MetricCardProps) {
  const styles = toneStyles[tone];
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md">
      <span
        className={`absolute inset-x-0 top-0 h-1 ${styles.bar}`}
        aria-hidden
      />
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
        <h3
          className={`text-xs font-semibold uppercase tracking-wide ${headerColor}`}
        >
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

type SliderFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  disabled?: boolean;
};

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  disabled,
}: SliderFieldProps) {
  return (
    <div className={disabled ? "opacity-60" : ""}>
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
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-2 w-full appearance-none rounded-full bg-slate-200 accent-emerald-600 disabled:cursor-not-allowed enabled:cursor-pointer"
      />
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  disabled?: boolean;
};

function NumberField({
  label,
  value,
  onChange,
  suffix,
  disabled,
}: NumberFieldProps) {
  // Local text state so the field can be cleared while typing (a bare
  // type=number forced back to 0 on every keystroke, blocking edits).
  const [text, setText] = useState(String(value));
  // Sync when the value changes externally (company switch / re-sync) using
  // the "adjust state during render" pattern instead of an effect.
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
          disabled={disabled}
          onChange={(event) => {
            const raw = event.target.value;
            setText(raw);
            if (raw === "" || raw === "-") {
              onChange(0);
              return;
            }
            const parsed = Number(raw);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
          onBlur={() => setText(String(value))}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
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

// Compact number input (no label) for table-style editors like the round
// schedule. Same clear-while-typing fix as NumberField.
function MiniNumber({
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
        onChange={(event) => {
          const raw = event.target.value;
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

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
};

function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type VarianceRow = {
  label: string;
  current: string;
  target: string;
  delta: number;
  format: (value: number) => string;
};

function VariancePanel({ rows }: { rows: VarianceRow[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
      <h2 className="text-lg font-semibold text-slate-900">
        Current → Target Variance
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Like-for-like delta from today&apos;s mark to your set target.
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Metric</span>
          <span className="text-right">Current</span>
          <span className="text-right">Target</span>
          <span className="text-right">Δ Variance</span>
        </div>
        {rows.map((row) => {
          const up = row.delta > 0;
          const down = row.delta < 0;
          const deltaTone = up
            ? "text-emerald-600"
            : down
            ? "text-rose-600"
            : "text-slate-400";
          return (
            <div
              key={row.label}
              className="grid grid-cols-[1.6fr_1fr_1fr_1fr] items-baseline border-t border-slate-100 px-4 py-3 text-sm transition hover:bg-slate-50/70"
            >
              <span className="text-slate-600">{row.label}</span>
              <span className="text-right tabular-nums text-slate-500">
                {row.current}
              </span>
              <span className="text-right font-semibold tabular-nums text-slate-900">
                {row.target}
              </span>
              <span
                className={`flex items-center justify-end gap-1 text-right font-semibold tabular-nums ${deltaTone}`}
              >
                <span aria-hidden>{up ? "▲" : down ? "▼" : "—"}</span>
                {row.format(row.delta)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-200/60 backdrop-blur">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
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
    <div
      className={`flex items-baseline justify-between gap-3 ${
        emphasis ? "border-t border-slate-100 pt-2" : ""
      }`}
    >
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

type TooltipPayloadItem = {
  name: string;
  value: number;
  color: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
  currency: Currency;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-1.5 space-y-1">
        {payload.map((item) => (
          <div
            key={item.name}
            className="flex items-center gap-2 text-sm text-slate-700"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-slate-500">{item.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900">
              {formatMoney(item.value, currency, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
