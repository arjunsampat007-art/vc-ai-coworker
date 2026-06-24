"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// A realized past-year actual. The company's track record — what VC firms
// anchor forward projections to, rather than trusting the plan in isolation.
type HistoricalPoint = { year: number; revenue: number; ebitda: number };

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
  // ── capital structure: bridges enterprise value → equity value ──
  currentNetDebt: number; // debt − cash today
  exitNetDebt: number; // debt − cash at exit (capacity build-out often grows it)
  exitType: ExitType;
  exitYear: number;
  // ── main targets ──
  targetRevenue: number;
  targetStake: number; // exit-stake override; 0 = derive from dilution rounds
  targetMultiple: number;
  // ── future funding rounds that dilute the stake ──
  rounds: Round[];
  // ── realized track record + how heavily it anchors the forecast ──
  historical: HistoricalPoint[];
  trackWeight: number; // 0–100: weight on history vs the plan in the projection
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
    currentNetDebt: 40,
    exitNetDebt: 120,
    historical: [
      { year: 2023, revenue: 35, ebitda: -2 },
      { year: 2024, revenue: 62, ebitda: 3 },
      { year: 2025, revenue: 90, ebitda: 8 },
    ],
    trackWeight: 30,
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
    currentNetDebt: 15,
    exitNetDebt: 30,
    historical: [
      { year: 2023, revenue: 30, ebitda: -1 },
      { year: 2024, revenue: 48, ebitda: 2 },
      { year: 2025, revenue: 64, ebitda: 5 },
    ],
    trackWeight: 30,
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
    currentNetDebt: -5,
    exitNetDebt: -10,
    historical: [
      { year: 2023, revenue: 22, ebitda: 0 },
      { year: 2024, revenue: 35, ebitda: 3 },
      { year: 2025, revenue: 47, ebitda: 6 },
    ],
    trackWeight: 30,
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
  valuation: number | null; // projected path — null before "today"
  actualValuation: number | null; // realized track record — null after "today"
  trendValuation: number | null; // today's value grown at revenue CAGR, no re-rating
  stakeValue: number | null; // null after exit — Cactus Partners has sold out
  isExit: boolean;
  isActual: boolean; // a realized past year vs a forecast year
};

// A full point-in-time read of the projection for one year — what the Year
// inspector surfaces when you type a year.
type YearPhase =
  | "historical"
  | "current"
  | "projected"
  | "exit"
  | "post-exit";

type YearSnapshot = {
  year: number;
  phase: YearPhase;
  hasData: boolean; // false for a past year with no recorded actual
  yearsFromToday: number;
  revenue: number;
  ebitda: number;
  margin: number;
  valuation: number; // enterprise value (revenue/EBITDA multiples are EV-based)
  netDebt: number;
  equityValue: number; // EV − net debt; what your stake actually claims
  stakePct: number | null; // null once the position is realized / pre-ownership
  positionValue: number | null;
  moicToDate: number | null; // unrealized mark ÷ invested
  gainOverInvested: number | null;
  impliedRevMultiple: number;
  impliedEbitdaMultiple: number;
};

// Per-company snapshot of every Exit Model input, persisted to localStorage so
// edits survive tab switches and reloads (the component unmounts when you leave
// the tab, which would otherwise reset all state to the preset).
type SavedState = {
  totalInvestment: number;
  currentStake: number;
  stakeMode: "percent" | "shares";
  sharesOutstanding: number;
  sharesHeld: number;
  currentYear: number;
  currentRevenue: number;
  currentEbitda: number;
  benchmarkRevMultiple: number;
  benchmarkEbitdaMultiple: number;
  overrideValuation: number;
  currentNetDebt: number;
  exitNetDebt: number;
  valuationBasis: ValuationBasis;
  exitType: ExitType;
  exitYear: number;
  targetRevenue: number;
  targetStake: number;
  targetMultiple: number;
  rounds: Round[];
  historical: HistoricalPoint[];
  trackWeight: number;
  carryPct: number;
  hurdlePct: number;
  txnCostPct: number;
  prefMultiple: number;
  prefType: PrefType;
  seniorPref: number;
  participationCap: number;
  scenarios: ScenarioInputs;
  currentSource: "data" | "manual";
};

// Fund-level economics — the terms a deal's gross proceeds run through to get
// to net-to-LP. Same across companies by default; persisted per-company so a
// one-off deal can carry bespoke terms.
const DEFAULT_CARRY_PCT = 20; // GP's share of profit above the hurdle
const DEFAULT_HURDLE_PCT = 8; // LP preferred return (IRR) before carry kicks in
const DEFAULT_TXN_COST_PCT = 2; // banker/legal costs on the sale

// Liquidation-preference terms for Cactus's own position.
const DEFAULT_PREF_MULT = 1; // 1× money-back preference
const DEFAULT_PREF_TYPE: PrefType = "non-participating";
const DEFAULT_SENIOR_PREF = 0; // ₹ Cr of preferences ranking ahead of Cactus
const DEFAULT_PART_CAP = 0; // participation cap (× invested); 0 = uncapped

type PrefType = "none" | "non-participating" | "participating";

// What Cactus actually collects from the equity proceeds at exit, given a
// liquidation-preference stack. Simplified single-holder waterfall: senior
// preferences rank ahead, then Cactus's own preference, then common shares the
// residual. Interim marks stay as-converted — this governs only the realization.
function cactusExitProceeds(p: {
  equityProceeds: number;
  invested: number;
  stakePct: number;
  prefMultiple: number;
  prefType: PrefType;
  seniorPref: number;
  participationCap: number; // × invested; 0 = uncapped
}) {
  const asConverted = (p.stakePct / 100) * Math.max(p.equityProceeds, 0);
  if (p.prefType === "none" || p.prefMultiple <= 0) return asConverted;

  const afterSenior = Math.max(
    0,
    Math.max(p.equityProceeds, 0) - Math.max(p.seniorPref, 0)
  );
  const pref = p.prefMultiple * p.invested;

  if (p.prefType === "non-participating") {
    // Take the greater of the preference (limited by what's left after senior
    // claims) or converting to common and going pro-rata.
    return Math.max(Math.min(pref, afterSenior), asConverted);
  }

  // Participating: take the preference, then also share the residual as common.
  const prefTake = Math.min(pref, afterSenior);
  const residual = Math.max(0, afterSenior - prefTake);
  const participated = prefTake + (p.stakePct / 100) * residual;
  if (p.participationCap > 0) {
    // Capped participating — but the holder can always convert if that beats
    // the capped amount.
    return Math.max(
      Math.min(participated, p.participationCap * p.invested),
      asConverted
    );
  }
  return participated;
}

// Editable Bear/Bull cases (Base mirrors the live main targets) plus the
// probability mass on each case.
type ScenarioCase = { revenue: number; multiple: number; exitYear: number };
type ScenarioInputs = {
  bear: ScenarioCase;
  bull: ScenarioCase;
  prob: { bear: number; base: number; bull: number };
};

// Seed Bear/Bull around the base targets — a haircut and a stretch — with a
// conventional 25/50/25 probability split.
const defaultScenarios = (
  revenue: number,
  multiple: number,
  exitYear: number,
  currentYear: number
): ScenarioInputs => ({
  bear: {
    revenue: Math.round(revenue * 0.6),
    multiple: Number((multiple * 0.7).toFixed(1)),
    exitYear: exitYear + 1,
  },
  bull: {
    revenue: Math.round(revenue * 1.3),
    multiple: Number((multiple * 1.2).toFixed(1)),
    exitYear: Math.max(exitYear - 1, currentYear + 1),
  },
  prob: { bear: 25, base: 50, bull: 25 },
});

type ExitOutcomeInput = {
  // scenario-varied exit levers
  targetRevenue: number;
  targetMultiple: number;
  exitYear: number;
  // position & financials (scenario-independent)
  currentYear: number;
  currentRevenue: number;
  currentEbitda: number;
  currentStake: number;
  targetStake: number;
  rounds: Round[];
  totalInvestment: number;
  currentValueOfInvestment: number;
  exitNetDebt: number;
  // track-record blend
  historicalCagr: number | null;
  trackWeight: number;
  // liquidation preference
  prefMultiple: number;
  prefType: PrefType;
  seniorPref: number;
  participationCap: number;
  // net-to-LP waterfall
  carryPct: number;
  hurdlePct: number;
  txnCostPct: number;
};

// Pure returns engine — mirrors the exit + net-waterfall math inside `model`
// so every scenario runs the same code path. The Base case MUST reconcile with
// the headline MOIC/IRR (identical inputs); if it ever drifts, that's the bug.
function exitOutcome(p: ExitOutcomeInput) {
  const years = Math.max(p.exitYear - p.currentYear, 0);
  const margin = p.currentRevenue > 0 ? p.currentEbitda / p.currentRevenue : 0;

  const weight =
    p.historicalCagr !== null
      ? Math.min(Math.max(p.trackWeight, 0), 100) / 100
      : 0;
  const historyExitRevenue =
    p.currentRevenue * Math.pow(1 + (p.historicalCagr ?? 0), years);
  const effectiveExitRevenue =
    (1 - weight) * p.targetRevenue + weight * historyExitRevenue;

  const dilutionFactorTo = (year: number) =>
    p.rounds
      .filter((r) => r.year <= year)
      .reduce((acc, r) => acc * (1 - Math.max(r.dilutionPct, 0) / 100), 1);
  const effectiveExitStake =
    p.targetStake > 0
      ? p.targetStake
      : p.currentStake * dilutionFactorTo(p.exitYear);

  const exitEbitda = effectiveExitRevenue * margin;
  const exitValuation = effectiveExitRevenue * p.targetMultiple; // enterprise value
  const exitEquityValue = exitValuation - p.exitNetDebt;
  const exitCplValue = cactusExitProceeds({
    equityProceeds: exitEquityValue,
    invested: p.totalInvestment,
    stakePct: effectiveExitStake,
    prefMultiple: p.prefMultiple,
    prefType: p.prefType,
    seniorPref: p.seniorPref,
    participationCap: p.participationCap,
  });
  const moic = p.totalInvestment > 0 ? exitCplValue / p.totalInvestment : 0;
  const forwardIrr =
    years > 0 && p.currentValueOfInvestment > 0
      ? Math.pow(exitCplValue / p.currentValueOfInvestment, 1 / years) - 1
      : 0;

  const txnCostAmount = exitCplValue * (p.txnCostPct / 100);
  const proceedsAfterCosts = exitCplValue - txnCostAmount;
  const prefAmount =
    p.hurdlePct > 0
      ? p.totalInvestment * (Math.pow(1 + p.hurdlePct / 100, years) - 1)
      : 0;
  const carryAmount =
    Math.max(0, proceedsAfterCosts - p.totalInvestment - prefAmount) *
    (p.carryPct / 100);
  const netProceeds = Math.max(0, proceedsAfterCosts - carryAmount);
  const netMoic = p.totalInvestment > 0 ? netProceeds / p.totalInvestment : 0;
  const netForwardIrr =
    years > 0 && p.currentValueOfInvestment > 0
      ? Math.pow(netProceeds / p.currentValueOfInvestment, 1 / years) - 1
      : 0;

  return {
    years,
    effectiveExitStake,
    effectiveExitRevenue,
    exitEbitda,
    exitValuation,
    exitEquityValue,
    exitCplValue,
    moic,
    forwardIrr,
    netProceeds,
    netMoic,
    netForwardIrr,
  };
}

const STORAGE_PREFIX = "vc-exit-model:";

const loadSaved = (name: string): SavedState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + name);
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch {
    return null;
  }
};

const saveState = (name: string, state: SavedState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(state));
  } catch {
    /* storage full or disabled — ignore */
  }
};

const clearSaved = (name: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + name);
  } catch {
    /* ignore */
  }
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

  // ── Capital structure: EV → equity bridge ─────────────────
  const [currentNetDebt, setCurrentNetDebt] = useState(initial.currentNetDebt);
  const [exitNetDebt, setExitNetDebt] = useState(initial.exitNetDebt);

  // ── Main targets ──────────────────────────────────────────
  const [exitType, setExitType] = useState<ExitType>(initial.exitType);
  const [exitYear, setExitYear] = useState(initial.exitYear);
  const [targetRevenue, setTargetRevenue] = useState(initial.targetRevenue);
  const [targetStake, setTargetStake] = useState(initial.targetStake);
  const [targetMultiple, setTargetMultiple] = useState(initial.targetMultiple);
  const [rounds, setRounds] = useState<Round[]>(initial.rounds);

  // ── Track record (past actuals) + how heavily it anchors the forecast ──
  const [historical, setHistorical] = useState<HistoricalPoint[]>(
    initial.historical
  );
  const [trackWeight, setTrackWeight] = useState(initial.trackWeight);

  // ── Fund economics — gross → net-to-LP waterfall ──────────
  const [carryPct, setCarryPct] = useState(DEFAULT_CARRY_PCT);
  const [hurdlePct, setHurdlePct] = useState(DEFAULT_HURDLE_PCT);
  const [txnCostPct, setTxnCostPct] = useState(DEFAULT_TXN_COST_PCT);

  // ── Liquidation preference ────────────────────────────────
  const [prefMultiple, setPrefMultiple] = useState(DEFAULT_PREF_MULT);
  const [prefType, setPrefType] = useState<PrefType>(DEFAULT_PREF_TYPE);
  const [seniorPref, setSeniorPref] = useState(DEFAULT_SENIOR_PREF);
  const [participationCap, setParticipationCap] = useState(DEFAULT_PART_CAP);

  // ── Scenario analysis — Bear/Bull cases + probabilities ───
  const [scenarioInputs, setScenarioInputs] = useState<ScenarioInputs>(() =>
    defaultScenarios(
      initial.targetRevenue,
      initial.targetMultiple,
      initial.exitYear,
      initial.currentYear
    )
  );

  // ── Year inspector — type a year, read the full projection for it ──
  const [inspectYear, setInspectYear] = useState(initial.exitYear);

  const applyPreset = (preset: CompanyPreset) => {
    setTotalInvestment(preset.totalInvestment);
    setCurrentStake(preset.currentStake);
    setSharesHeld((preset.currentStake / 100) * sharesOutstanding);
    setCurrentYear(preset.currentYear);
    setCurrentRevenue(preset.currentRevenue);
    setCurrentEbitda(preset.currentEbitda);
    setBenchmarkRevMultiple(preset.benchmarkRevMultiple);
    setBenchmarkEbitdaMultiple(preset.benchmarkEbitdaMultiple);
    setOverrideValuation(preset.overrideValuation);
    setCurrentNetDebt(preset.currentNetDebt);
    setExitNetDebt(preset.exitNetDebt);
    setExitType(preset.exitType);
    setExitYear(preset.exitYear);
    setTargetRevenue(preset.targetRevenue);
    setTargetStake(preset.targetStake);
    setTargetMultiple(preset.targetMultiple);
    setRounds(preset.rounds);
    setHistorical(preset.historical);
    setTrackWeight(preset.trackWeight);
    setScenarioInputs(
      defaultScenarios(
        preset.targetRevenue,
        preset.targetMultiple,
        preset.exitYear,
        preset.currentYear
      )
    );
  };

  const selectCompany = (name: string) => {
    const preset = PORTFOLIO.find((c) => c.name === name);
    if (!preset) return;
    setCompany(preset.name);
    applyPreset(preset);
  };

  // ── Persistence ───────────────────────────────────────────
  // skipSave swallows the one save that the hydrate effect's setters would
  // otherwise trigger, so restoring saved data never clobbers it.
  const skipSave = useRef(false);

  // Hydrate from localStorage on mount and whenever the company changes. Runs
  // only after mount (effects don't run during SSR), so there's no hydration
  // mismatch — the first client render still matches the server's preset.
  useEffect(() => {
    const saved = loadSaved(company);
    if (!saved) return;
    skipSave.current = true;
    setTotalInvestment(saved.totalInvestment);
    setCurrentStake(saved.currentStake);
    setStakeMode(saved.stakeMode);
    setSharesOutstanding(saved.sharesOutstanding);
    setSharesHeld(saved.sharesHeld);
    setCurrentYear(saved.currentYear);
    setCurrentRevenue(saved.currentRevenue);
    setCurrentEbitda(saved.currentEbitda);
    setBenchmarkRevMultiple(saved.benchmarkRevMultiple);
    setBenchmarkEbitdaMultiple(saved.benchmarkEbitdaMultiple);
    setOverrideValuation(saved.overrideValuation);
    setCurrentNetDebt(
      saved.currentNetDebt ??
        PORTFOLIO.find((c) => c.name === company)?.currentNetDebt ??
        0
    );
    setExitNetDebt(
      saved.exitNetDebt ??
        PORTFOLIO.find((c) => c.name === company)?.exitNetDebt ??
        0
    );
    setValuationBasis(saved.valuationBasis);
    setExitType(saved.exitType);
    setExitYear(saved.exitYear);
    setTargetRevenue(saved.targetRevenue);
    setTargetStake(saved.targetStake);
    setTargetMultiple(saved.targetMultiple);
    setRounds(saved.rounds);
    // Older saved snapshots predate the track-record fields — fall back to the
    // company's preset history so existing localStorage doesn't break.
    setHistorical(
      saved.historical ??
        PORTFOLIO.find((c) => c.name === company)?.historical ??
        []
    );
    setTrackWeight(saved.trackWeight ?? 0);
    setCarryPct(saved.carryPct ?? DEFAULT_CARRY_PCT);
    setHurdlePct(saved.hurdlePct ?? DEFAULT_HURDLE_PCT);
    setTxnCostPct(saved.txnCostPct ?? DEFAULT_TXN_COST_PCT);
    setPrefMultiple(saved.prefMultiple ?? DEFAULT_PREF_MULT);
    setPrefType(saved.prefType ?? DEFAULT_PREF_TYPE);
    setSeniorPref(saved.seniorPref ?? DEFAULT_SENIOR_PREF);
    setParticipationCap(saved.participationCap ?? DEFAULT_PART_CAP);
    setScenarioInputs(
      saved.scenarios ??
        defaultScenarios(
          saved.targetRevenue,
          saved.targetMultiple,
          saved.exitYear,
          saved.currentYear
        )
    );
    setCurrentSource(saved.currentSource);
  }, [company]);

  // Auto-save every edit for the active company.
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    saveState(company, {
      totalInvestment,
      currentStake,
      stakeMode,
      sharesOutstanding,
      sharesHeld,
      currentYear,
      currentRevenue,
      currentEbitda,
      benchmarkRevMultiple,
      benchmarkEbitdaMultiple,
      overrideValuation,
      currentNetDebt,
      exitNetDebt,
      valuationBasis,
      exitType,
      exitYear,
      targetRevenue,
      targetStake,
      targetMultiple,
      rounds,
      historical,
      trackWeight,
      carryPct,
      hurdlePct,
      txnCostPct,
      prefMultiple,
      prefType,
      seniorPref,
      participationCap,
      scenarios: scenarioInputs,
      currentSource,
    });
  }, [
    company,
    totalInvestment,
    currentStake,
    stakeMode,
    sharesOutstanding,
    sharesHeld,
    currentYear,
    currentRevenue,
    currentEbitda,
    benchmarkRevMultiple,
    benchmarkEbitdaMultiple,
    overrideValuation,
    currentNetDebt,
    exitNetDebt,
    valuationBasis,
    exitType,
    exitYear,
    targetRevenue,
    targetStake,
    targetMultiple,
    rounds,
    historical,
    trackWeight,
    carryPct,
    hurdlePct,
    txnCostPct,
    prefMultiple,
    prefType,
    seniorPref,
    participationCap,
    scenarioInputs,
    currentSource,
  ]);

  const resetCompany = () => {
    clearSaved(company);
    const preset = PORTFOLIO.find((c) => c.name === company);
    if (preset) applyPreset(preset);
    setCarryPct(DEFAULT_CARRY_PCT);
    setHurdlePct(DEFAULT_HURDLE_PCT);
    setTxnCostPct(DEFAULT_TXN_COST_PCT);
    setPrefMultiple(DEFAULT_PREF_MULT);
    setPrefType(DEFAULT_PREF_TYPE);
    setSeniorPref(DEFAULT_SENIOR_PREF);
    setParticipationCap(DEFAULT_PART_CAP);
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

  const updateHist = (index: number, patch: Partial<HistoricalPoint>) =>
    setHistorical((prev) =>
      prev.map((h, i) => (i === index ? { ...h, ...patch } : h))
    );
  const removeHist = (index: number) =>
    setHistorical((prev) => prev.filter((_, i) => i !== index));
  const addHist = () =>
    setHistorical((prev) => {
      // New row defaults to the year before the earliest existing one (or the
      // year before "today"), so a track record naturally extends backwards.
      const earliest = prev.length
        ? Math.min(...prev.map((h) => h.year))
        : currentYear;
      return [
        { year: earliest - 1, revenue: 0, ebitda: 0 },
        ...prev,
      ];
    });

  const editCase = (key: "bear" | "bull", patch: Partial<ScenarioCase>) =>
    setScenarioInputs((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const editProb = (key: "bear" | "base" | "bull", value: number) =>
    setScenarioInputs((prev) => ({
      ...prev,
      prob: { ...prev.prob, [key]: Math.max(value, 0) },
    }));
  const resetScenarios = () =>
    setScenarioInputs(
      defaultScenarios(targetRevenue, targetMultiple, exitYear, currentYear)
    );

  const pullCurrentFromData = () => {
    const preset = PORTFOLIO.find((c) => c.name === company);
    if (!preset) return;
    setCurrentYear(preset.currentYear);
    setCurrentRevenue(preset.currentRevenue);
    setCurrentEbitda(preset.currentEbitda);
    setBenchmarkRevMultiple(preset.benchmarkRevMultiple);
    setBenchmarkEbitdaMultiple(preset.benchmarkEbitdaMultiple);
    setOverrideValuation(preset.overrideValuation);
    setCurrentNetDebt(preset.currentNetDebt);
    setExitNetDebt(preset.exitNetDebt);
  };

  const lockCurrent = currentSource === "data";

  // Which valuation drivers are switched on. Excluding one values the company
  // on the other alone; at least one must stay on. Maps onto valuationBasis.
  const includeRevenue = valuationBasis !== "ebitda";
  const includeEbitda = valuationBasis !== "revenue";
  const toggleDriver = (driver: "revenue" | "ebitda") => {
    if (driver === "revenue") {
      if (includeRevenue) {
        if (includeEbitda) setValuationBasis("ebitda"); // drop revenue
      } else {
        setValuationBasis(includeEbitda ? "blend" : "revenue"); // add revenue
      }
    } else {
      if (includeEbitda) {
        if (includeRevenue) setValuationBasis("revenue"); // drop EBITDA
      } else {
        setValuationBasis(includeRevenue ? "blend" : "ebitda"); // add EBITDA
      }
    }
  };

  const sector =
    PORTFOLIO.find((c) => c.name === company)?.sector ??
    PORTFOLIO[0].sector;
  const sectorBenchmark = SECTOR_BENCHMARKS[sector];

  const model = useMemo(() => {
    const margin = currentRevenue > 0 ? currentEbitda / currentRevenue : 0;
    const years = Math.max(exitYear - currentYear, 0);

    // Growth the PLAN implies — getting from current to target revenue.
    const planCagr =
      years > 0 && currentRevenue > 0
        ? Math.pow(targetRevenue / currentRevenue, 1 / years) - 1
        : 0;

    // ── Track record ─────────────────────────────────────────
    // Realized growth from the company's actuals. We anchor on the earliest
    // past year and run it through to today's revenue, so the whole history
    // (including the latest actual = current) feeds the CAGR. This is the
    // number VC firms sanity-check the plan against.
    const histPoints = historical
      .filter((h) => h.year < currentYear && h.revenue > 0)
      .sort((a, b) => a.year - b.year);
    const hasHistory = histPoints.length > 0;
    const histStart = hasHistory ? histPoints[0] : null;
    const histSpan = histStart ? currentYear - histStart.year : 0;
    const historicalCagr =
      histStart && histSpan > 0 && histStart.revenue > 0
        ? Math.pow(currentRevenue / histStart.revenue, 1 / histSpan) - 1
        : null;

    // Weight only bites when there's a track record to lean on.
    const weight = historicalCagr !== null ? Math.min(Math.max(trackWeight, 0), 100) / 100 : 0;

    // Where the company lands at exit if it simply kept compounding at its
    // historical rate. We blend that with the plan's target revenue by weight:
    // weight 0 → trust the plan, weight 1 → trust the track record.
    const historyExitRevenue =
      currentRevenue * Math.pow(1 + (historicalCagr ?? planCagr), years);
    const effectiveExitRevenue =
      (1 - weight) * targetRevenue + weight * historyExitRevenue;

    // CAGR of the blended path — what the projected (green) curve actually runs.
    const impliedCagr =
      years > 0 && currentRevenue > 0
        ? Math.pow(effectiveExitRevenue / currentRevenue, 1 / years) - 1
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
    // Enterprise value → equity value. Revenue/EBITDA multiples are EV-based,
    // but your stake claims equity — so net debt (debt − cash) is bridged out
    // before applying the stake. Net cash (negative net debt) lifts equity.
    const currentEquityValue = currentValuation - currentNetDebt;
    const currentValueOfInvestment = currentEquityValue * (currentStake / 100);

    // Net debt walks linearly from today's level to the exit level over the
    // hold; used for the per-year equity value on the chart and inspector.
    const netDebtAt = (year: number) => {
      const span = exitYear - currentYear;
      if (span <= 0 || year <= currentYear) return currentNetDebt;
      if (year >= exitYear) return exitNetDebt;
      return (
        currentNetDebt +
        (exitNetDebt - currentNetDebt) * ((year - currentYear) / span)
      );
    };

    // Dilution: each round multiplies the stake by (1 − dilution%). The exit
    // stake is derived from rounds up to exit, unless an override is set.
    const dilutionFactorTo = (year: number) =>
      rounds
        .filter((r) => r.year <= year)
        .reduce((acc, r) => acc * (1 - Math.max(r.dilutionPct, 0) / 100), 1);
    const dilutedExitStake = currentStake * dilutionFactorTo(exitYear);
    const effectiveExitStake = targetStake > 0 ? targetStake : dilutedExitStake;

    // Exit economics run off the track-record-adjusted (blended) revenue, so
    // the weight slider flows all the way through to MOIC and IRR. The pure
    // plan is kept alongside as a reference for the "plan vs track record" gap.
    const exitEbitda = effectiveExitRevenue * margin;
    const exitValuation = effectiveExitRevenue * targetMultiple; // enterprise value
    const exitEquityValue = exitValuation - exitNetDebt;
    const prefArgs = {
      invested: totalInvestment,
      stakePct: effectiveExitStake,
      prefMultiple,
      prefType,
      seniorPref,
      participationCap,
    };
    // Proceeds run through the liquidation-preference waterfall (matters in a
    // downside, where the preference floors what common would have taken).
    const exitCplValue = cactusExitProceeds({
      equityProceeds: exitEquityValue,
      ...prefArgs,
    });
    // What pure pro-rata (as-converted) would have paid — for the pref delta.
    const exitAsConverted = exitEquityValue * (effectiveExitStake / 100);
    const prefUplift = exitCplValue - exitAsConverted;

    const planExitValuation = targetRevenue * targetMultiple;
    const planExitEquityValue = planExitValuation - exitNetDebt;
    const planExitCplValue = cactusExitProceeds({
      equityProceeds: planExitEquityValue,
      ...prefArgs,
    });
    const planMoic =
      totalInvestment > 0 ? planExitCplValue / totalInvestment : 0;

    const moic = totalInvestment > 0 ? exitCplValue / totalInvestment : 0;
    const forwardIrr =
      years > 0 && currentValueOfInvestment > 0
        ? Math.pow(exitCplValue / currentValueOfInvestment, 1 / years) - 1
        : 0;

    // ── Net-to-LP waterfall ───────────────────────────────────
    // Gross stake proceeds run through transaction costs, then a deal-by-deal
    // carry waterfall: LPs get their capital back plus a preferred return before
    // the GP takes carryPct of the remaining profit (hard hurdle, no GP
    // catch-up). Net proceeds = what actually reaches LPs.
    const txnCostAmount = exitCplValue * (txnCostPct / 100);
    const proceedsAfterCosts = exitCplValue - txnCostAmount;
    const prefAmount =
      hurdlePct > 0
        ? totalInvestment * (Math.pow(1 + hurdlePct / 100, years) - 1)
        : 0;
    const profitAboveHurdle = Math.max(
      0,
      proceedsAfterCosts - totalInvestment - prefAmount
    );
    const carryAmount = profitAboveHurdle * (carryPct / 100);
    const netProceeds = Math.max(0, proceedsAfterCosts - carryAmount);
    const grossProfit = exitCplValue - totalInvestment;
    const netMoic = totalInvestment > 0 ? netProceeds / totalInvestment : 0;
    const netForwardIrr =
      years > 0 && currentValueOfInvestment > 0
        ? Math.pow(netProceeds / currentValueOfInvestment, 1 / years) - 1
        : 0;
    // Total drag from gross to net, as a share of gross proceeds.
    const feeDrag =
      exitCplValue > 0 ? (exitCplValue - netProceeds) / exitCplValue : 0;

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

    // Per-year trajectory. To the LEFT of today we plot realized actuals (a
    // solid history line); to the RIGHT, the projected valuation (green) runs a
    // smooth geometric path from today's mark to the blended exit valuation, so
    // both ends match the KPI cards. It carries one year past exit for context.
    // The stake (black) ramps from current to target ownership and then ends —
    // Cactus Partners has exited.
    const histByYear = new Map(histPoints.map((h) => [h.year, h]));
    const startYear = hasHistory ? histStart!.year : currentYear;
    const series: YearPoint[] = [];
    for (let year = startYear; year <= exitYear + 1; year++) {
      const t = year - currentYear;
      const isExit = year === exitYear;
      const postExit = year > exitYear;
      const isPast = year < currentYear;

      if (isPast) {
        // Realized actuals — only years we actually have data for get a mark;
        // gaps stay null and the line connects across them.
        const point = histByYear.get(year);
        const actualValuation = point
          ? valueByBasis(
              point.revenue,
              point.ebitda,
              benchmarkRevMultiple,
              benchmarkEbitdaMultiple
            )
          : null;
        series.push({
          year,
          revenue: point ? Number(point.revenue.toFixed(1)) : 0,
          ebitda: point ? Number(point.ebitda.toFixed(1)) : 0,
          valuation: null,
          actualValuation:
            actualValuation === null ? null : Number(actualValuation.toFixed(1)),
          trendValuation: null,
          stakeValue: null,
          isExit: false,
          isActual: true,
        });
        continue;
      }

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
        // The history line meets the projection at today so they join cleanly.
        actualValuation:
          year === currentYear ? Number(currentValuation.toFixed(1)) : null,
        trendValuation: Number(trendValuation.toFixed(1)),
        // Stake value runs off EQUITY value (EV − net debt), not EV.
        stakeValue: postExit
          ? null
          : Number(
              ((valuation - netDebtAt(year)) * (stake / 100)).toFixed(1)
            ),
        isExit,
        isActual: false,
      });
    }

    // Full read of the projection for any single year — used by the Year
    // inspector. Mirrors the per-year series math but as a closed form so it
    // works for any year you type, not just the plotted integer points.
    const snapshotAt = (year: number): YearSnapshot => {
      const t = year - currentYear;

      // Past — show the recorded actual, or flag that none exists.
      if (year < currentYear) {
        const point = histByYear.get(year);
        if (!point) {
          return {
            year,
            phase: "historical",
            hasData: false,
            yearsFromToday: t,
            revenue: 0,
            ebitda: 0,
            margin: 0,
            valuation: 0,
            netDebt: 0,
            equityValue: 0,
            stakePct: null,
            positionValue: null,
            moicToDate: null,
            gainOverInvested: null,
            impliedRevMultiple: 0,
            impliedEbitdaMultiple: 0,
          };
        }
        const val = valueByBasis(
          point.revenue,
          point.ebitda,
          benchmarkRevMultiple,
          benchmarkEbitdaMultiple
        );
        return {
          year,
          phase: "historical",
          hasData: true,
          yearsFromToday: t,
          revenue: point.revenue,
          ebitda: point.ebitda,
          margin: point.revenue > 0 ? point.ebitda / point.revenue : 0,
          valuation: val,
          netDebt: 0,
          equityValue: val,
          stakePct: null,
          positionValue: null,
          moicToDate: null,
          gainOverInvested: null,
          impliedRevMultiple: point.revenue > 0 ? val / point.revenue : 0,
          impliedEbitdaMultiple: point.ebitda > 0 ? val / point.ebitda : 0,
        };
      }

      const rev = currentRevenue * Math.pow(1 + impliedCagr, t);
      const ebitda = rev * margin;
      const valuation =
        currentValuation > 0 && exitValuation > 0 && years > 0
          ? currentValuation *
            Math.pow(exitValuation / currentValuation, t / years)
          : currentValuation;
      const postExit = year > exitYear;
      const netDebt = netDebtAt(year);
      const equityValue = valuation - netDebt;
      const stakePct =
        targetStake > 0
          ? currentStake +
            (targetStake - currentStake) *
              (years > 0 ? Math.min(t / years, 1) : 0)
          : currentStake * dilutionFactorTo(year);
      // Interim years are marked as-converted (pro-rata); the exit year shows
      // the realized proceeds after the liquidation-preference waterfall.
      const positionValue = postExit
        ? null
        : year === exitYear
        ? exitCplValue
        : equityValue * (stakePct / 100);
      const phase: YearPhase =
        year === exitYear
          ? "exit"
          : year === currentYear
          ? "current"
          : postExit
          ? "post-exit"
          : "projected";
      return {
        year,
        phase,
        hasData: true,
        yearsFromToday: t,
        revenue: rev,
        ebitda,
        margin,
        valuation,
        netDebt,
        equityValue,
        stakePct: postExit ? null : stakePct,
        positionValue,
        moicToDate:
          positionValue !== null && totalInvestment > 0
            ? positionValue / totalInvestment
            : null,
        gainOverInvested:
          positionValue !== null ? positionValue - totalInvestment : null,
        impliedRevMultiple: rev > 0 ? valuation / rev : 0,
        impliedEbitdaMultiple: ebitda > 0 ? valuation / ebitda : 0,
      };
    };

    return {
      margin,
      years,
      impliedCagr,
      planCagr,
      historicalCagr,
      hasHistory,
      histSpan,
      effectiveWeight: weight,
      effectiveExitRevenue,
      historyExitRevenue,
      currentValuation,
      currentEquityValue,
      currentNetDebt,
      exitNetDebt,
      currentValueOfInvestment,
      usingOverride: overrideValuation > 0,
      exitEbitda,
      exitValuation,
      exitEquityValue,
      exitAsConverted,
      prefUplift,
      planExitValuation,
      planExitCplValue,
      planMoic,
      exitCplValue,
      dilutedExitStake,
      effectiveExitStake,
      usingStakeOverride: targetStake > 0,
      moic,
      forwardIrr,
      txnCostAmount,
      prefAmount,
      carryAmount,
      netProceeds,
      grossProfit,
      netMoic,
      netForwardIrr,
      feeDrag,
      currentImpliedRevMultiple,
      currentImpliedEbitdaMultiple,
      exitImpliedEbitdaMultiple,
      sectorRevPremium,
      projectedTrendYear,
      series,
      snapshotAt,
    };
  }, [
    currentRevenue,
    currentEbitda,
    currentYear,
    valuationBasis,
    benchmarkRevMultiple,
    benchmarkEbitdaMultiple,
    overrideValuation,
    currentNetDebt,
    exitNetDebt,
    currentStake,
    exitYear,
    targetRevenue,
    targetStake,
    targetMultiple,
    totalInvestment,
    rounds,
    historical,
    trackWeight,
    carryPct,
    hurdlePct,
    txnCostPct,
    prefMultiple,
    prefType,
    seniorPref,
    participationCap,
    sectorBenchmark,
  ]);

  // Scenario-independent inputs shared by every exitOutcome() call (scenarios,
  // goal-seek, sensitivity). Only targetRevenue / targetMultiple / exitYear vary.
  const engineCommon = useMemo(
    () => ({
      currentYear,
      currentRevenue,
      currentEbitda,
      currentStake,
      targetStake,
      rounds,
      totalInvestment,
      currentValueOfInvestment: model.currentValueOfInvestment,
      exitNetDebt,
      historicalCagr: model.historicalCagr,
      trackWeight,
      prefMultiple,
      prefType,
      seniorPref,
      participationCap,
      carryPct,
      hurdlePct,
      txnCostPct,
    }),
    [
      currentYear,
      currentRevenue,
      currentEbitda,
      currentStake,
      targetStake,
      rounds,
      totalInvestment,
      model.currentValueOfInvestment,
      exitNetDebt,
      model.historicalCagr,
      trackWeight,
      prefMultiple,
      prefType,
      seniorPref,
      participationCap,
      carryPct,
      hurdlePct,
      txnCostPct,
    ]
  );

  // ── Scenario analysis ──────────────────────────────────────
  // Base mirrors the live main targets; Bear/Bull are the editable cases. All
  // three run through the same exitOutcome() engine, then probability-weight
  // into an expected return (normalized so probabilities needn't sum to 100).
  const scenarios = useMemo(() => {
    const common = engineCommon;
    const defs = [
      {
        key: "bear" as const,
        label: "Bear",
        tone: "bear" as const,
        editable: true,
        revenue: scenarioInputs.bear.revenue,
        multiple: scenarioInputs.bear.multiple,
        exitYear: scenarioInputs.bear.exitYear,
        probability: scenarioInputs.prob.bear,
      },
      {
        key: "base" as const,
        label: "Base",
        tone: "base" as const,
        editable: false,
        revenue: targetRevenue,
        multiple: targetMultiple,
        exitYear,
        probability: scenarioInputs.prob.base,
      },
      {
        key: "bull" as const,
        label: "Bull",
        tone: "bull" as const,
        editable: true,
        revenue: scenarioInputs.bull.revenue,
        multiple: scenarioInputs.bull.multiple,
        exitYear: scenarioInputs.bull.exitYear,
        probability: scenarioInputs.prob.bull,
      },
    ];
    const cases = defs.map((d) => ({
      ...d,
      out: exitOutcome({
        ...common,
        targetRevenue: d.revenue,
        targetMultiple: d.multiple,
        exitYear: d.exitYear,
      }),
    }));
    const probSum = cases.reduce((s, c) => s + c.probability, 0);
    const wsum = (sel: (o: ReturnType<typeof exitOutcome>) => number) =>
      probSum > 0
        ? cases.reduce((s, c) => s + (c.probability / probSum) * sel(c.out), 0)
        : 0;
    const expected = {
      exitCplValue: wsum((o) => o.exitCplValue),
      moic: wsum((o) => o.moic),
      netMoic: wsum((o) => o.netMoic),
      forwardIrr: wsum((o) => o.forwardIrr),
      netForwardIrr: wsum((o) => o.netForwardIrr),
      netProceeds: wsum((o) => o.netProceeds),
    };
    return { cases, probSum, expected };
  }, [engineCommon, scenarioInputs, targetRevenue, targetMultiple, exitYear]);

  // ── Goal-seek: solve for the lever needed to clear a target return ──
  const [goalMetric, setGoalMetric] = useState<"netMoic" | "moic">("netMoic");
  const [goalTarget, setGoalTarget] = useState(3);
  const [goalLever, setGoalLever] = useState<"multiple" | "revenue">("multiple");
  const goalSeek = useMemo(() => {
    const evalAt = (x: number) =>
      exitOutcome({
        ...engineCommon,
        targetRevenue: goalLever === "revenue" ? x : targetRevenue,
        targetMultiple: goalLever === "multiple" ? x : targetMultiple,
        exitYear,
      })[goalMetric];
    // exitOutcome is monotonic increasing in both levers → bisect.
    const hi = goalLever === "multiple" ? 100 : 1e7;
    const feasible = evalAt(hi) >= goalTarget;
    let lo = 0;
    let h = hi;
    if (feasible) {
      for (let i = 0; i < 64; i++) {
        const mid = (lo + h) / 2;
        if (evalAt(mid) < goalTarget) lo = mid;
        else h = mid;
      }
    }
    const required = feasible ? (lo + h) / 2 : hi;
    const baseValue = goalLever === "multiple" ? targetMultiple : targetRevenue;
    return { feasible, required, baseValue, atMax: evalAt(hi) };
  }, [
    engineCommon,
    goalMetric,
    goalTarget,
    goalLever,
    targetRevenue,
    targetMultiple,
    exitYear,
  ]);

  // ── Sensitivity: net MOIC across exit multiple × revenue ──
  const sensitivity = useMemo(() => {
    const factors = [0.6, 0.8, 1.0, 1.2, 1.4];
    // Multiples descending (high at top), revenues ascending (high at right).
    const mults = factors.map((f) => targetMultiple * f).reverse();
    const revs = factors.map((f) => targetRevenue * f);
    const grid = mults.map((m) =>
      revs.map(
        (r) =>
          exitOutcome({
            ...engineCommon,
            targetRevenue: r,
            targetMultiple: m,
            exitYear,
          }).netMoic
      )
    );
    return { mults, revs, grid };
  }, [engineCommon, targetRevenue, targetMultiple, exitYear]);

  // ── Exit diagnostic: which lever is dragging returns the most ──
  // MOIC = (targetRevenue × targetMultiple × targetStake) / totalInvestment.
  // Score each lever against a reference; the lowest ratio is the weak link.
  const HURDLE_MOIC = 3;
  const missingExit = model.moic < HURDLE_MOIC;
  // Judge planned growth against what the company has actually delivered; fall
  // back to a generic 25% bar only when there's no track record to anchor to.
  const CAGR_REFERENCE =
    model.historicalCagr !== null && model.historicalCagr > 0
      ? model.historicalCagr
      : 0.25;
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
      ratio: model.planCagr / CAGR_REFERENCE,
      detail:
        model.historicalCagr !== null
          ? `the plan needs ${pct(model.planCagr * 100)} CAGR vs the ${pct(
              model.historicalCagr * 100
            )} the company has actually delivered`
          : `revenue compounds at just ${pct(
              model.planCagr * 100
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

  // Year inspector — recomputes live as you change the year.
  const snapshot = model.snapshotAt(inspectYear);
  const inspectMin = model.series.length ? model.series[0].year : currentYear;
  const inspectMax = exitYear + 1;

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
            detail={`${pct(currentStake)} of ${money(
              model.currentEquityValue,
              0
            )} equity`}
            tone="info"
          />
          <MetricCard
            label={
              model.effectiveWeight > 0
                ? "Adjusted · Cactus Partners exit value"
                : "Target · Cactus Partners exit value"
            }
            value={money(model.exitCplValue, 1)}
            detail={`${pct(model.effectiveExitStake)} of ${money(
              model.exitEquityValue,
              0
            )} equity at exit`}
            tone="neutral"
          />
          <MetricCard
            label="MOIC · gross"
            value={`${model.moic.toFixed(2)}×`}
            detail={`${model.netMoic.toFixed(2)}× net of fees & carry`}
            tone={model.moic >= 1 ? "success" : "danger"}
          />
          <MetricCard
            label="Forward IRR · gross"
            value={pct(model.forwardIrr * 100, 1)}
            detail={`${pct(model.netForwardIrr * 100, 1)} net · over ${
              model.years
            }y`}
            tone={model.forwardIrr >= 0 ? "success" : "danger"}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* ── Inputs ──────────────────────────────────────── */}
          <aside className="h-fit space-y-6 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Model Inputs
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                  <span
                    className="flex h-1.5 w-1.5 rounded-full bg-emerald-500"
                    aria-hidden
                  />
                  Auto-saved for {company} · survives tab switches
                </p>
              </div>
              <button
                onClick={resetCompany}
                className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                Reset to default
              </button>
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
              <p className="text-xs text-slate-500">
                Pick which drivers to value the company on. Exclude one to value
                on the other alone.
              </p>
              <div className="space-y-2">
                <DriverToggle
                  label="Revenue"
                  detail={`${money(currentRevenue, 0)} × ${mult(
                    benchmarkRevMultiple
                  )}`}
                  checked={includeRevenue}
                  lastOne={includeRevenue && !includeEbitda}
                  onToggle={() => toggleDriver("revenue")}
                />
                <DriverToggle
                  label="EBITDA"
                  detail={`${money(currentEbitda, 0)} × ${mult(
                    benchmarkEbitdaMultiple
                  )}`}
                  checked={includeEbitda}
                  lastOne={includeEbitda && !includeRevenue}
                  onToggle={() => toggleDriver("ebitda")}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {valuationBasis === "blend"
                  ? "Valued on the average of revenue & EBITDA."
                  : valuationBasis === "revenue"
                  ? "Valued on revenue only — EBITDA excluded."
                  : "Valued on EBITDA only — revenue excluded."}
              </p>
              <SliderField
                label="Benchmark revenue multiple"
                value={benchmarkRevMultiple}
                onChange={setBenchmarkRevMultiple}
                min={0}
                max={30}
                step={0.1}
                format={mult}
                disabled={lockCurrent || !includeRevenue}
              />
              <SliderField
                label="Benchmark EBITDA multiple"
                value={benchmarkEbitdaMultiple}
                onChange={setBenchmarkEbitdaMultiple}
                min={0}
                max={60}
                step={0.5}
                format={mult}
                disabled={lockCurrent || !includeEbitda}
              />
              <NumberField
                label="Override valuation (0 = use comps)"
                value={overrideValuation}
                onChange={setOverrideValuation}
                suffix="₹ Cr"
                disabled={lockCurrent}
              />
            </FieldGroup>

            <FieldGroup title="Capital structure (net debt)" theme="current">
              <p className="text-xs text-slate-500">
                Revenue &amp; EBITDA multiples give <strong>enterprise value</strong>
                ; your stake claims <strong>equity</strong>. Net debt (debt −
                cash) bridges the two. Use a negative number for net cash.
              </p>
              <NumberField
                label="Net debt today"
                value={currentNetDebt}
                onChange={setCurrentNetDebt}
                suffix="₹ Cr"
                disabled={lockCurrent}
              />
              <NumberField
                label="Net debt at exit"
                value={exitNetDebt}
                onChange={setExitNetDebt}
                suffix="₹ Cr"
              />
              <p className="text-xs text-slate-400">
                Equity now{" "}
                <strong className="text-slate-600">
                  {money(model.currentEquityValue, 0)}
                </strong>{" "}
                (EV {money(model.currentValuation, 0)}) · equity at exit{" "}
                <strong className="text-slate-600">
                  {money(model.exitEquityValue, 0)}
                </strong>{" "}
                (EV {money(model.exitValuation, 0)}).
              </p>
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

            <FieldGroup title="Track record (past actuals)" theme="history">
              <p className="text-xs text-slate-500">
                Realized past-year financials. The forecast is anchored to this
                history, not just the target — set the weight below. Values in
                ₹&nbsp;Cr.
              </p>
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Year</span>
                <span>Revenue</span>
                <span>EBITDA</span>
                <span />
              </div>
              {historical.length === 0 && (
                <p className="text-xs text-slate-400">
                  No history yet — the forecast runs purely off the target.
                </p>
              )}
              {historical.map((h, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-x-2"
                >
                  <MiniNumber
                    value={h.year}
                    onChange={(v) => updateHist(i, { year: v })}
                  />
                  <MiniNumber
                    value={h.revenue}
                    onChange={(v) => updateHist(i, { revenue: v })}
                  />
                  <MiniNumber
                    value={h.ebitda}
                    onChange={(v) => updateHist(i, { ebitda: v })}
                  />
                  <button
                    onClick={() => removeHist(i)}
                    className="justify-self-end rounded-lg px-2 py-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove year"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={addHist}
                className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                + Add past year
              </button>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
                <SliderField
                  label="Weight on track record"
                  value={trackWeight}
                  onChange={setTrackWeight}
                  min={0}
                  max={100}
                  step={5}
                  format={(v) => pct(v, 0)}
                  disabled={!model.hasHistory}
                />
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {model.hasHistory ? (
                    <>
                      0% trusts the plan · 100% extrapolates the track record.
                      Historical CAGR{" "}
                      <strong className="text-indigo-700">
                        {pct((model.historicalCagr ?? 0) * 100)}
                      </strong>{" "}
                      over {model.histSpan}y · plan implies{" "}
                      <strong className="text-slate-700">
                        {pct(model.planCagr * 100)}
                      </strong>{" "}
                      · projected{" "}
                      <strong className="text-emerald-700">
                        {pct(model.impliedCagr * 100)}
                      </strong>
                      .
                    </>
                  ) : (
                    <>Add at least one past year to enable weighting.</>
                  )}
                </p>
              </div>
              {model.hasHistory && model.effectiveWeight > 0 && (
                <p className="text-xs text-slate-400">
                  At {pct(trackWeight, 0)} weight, exit revenue is tempered to{" "}
                  <strong className="text-slate-600">
                    {money(model.effectiveExitRevenue, 0)}
                  </strong>{" "}
                  (plan {money(targetRevenue, 0)} · history{" "}
                  {money(model.historyExitRevenue, 0)}).
                </p>
              )}
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

            <FieldGroup title="Liquidation preference">
              <p className="text-xs text-slate-500">
                How your proceeds are protected in a downside exit. In the upside
                you convert to common and go pro-rata — the preference only bites
                when common would have paid less.
              </p>
              <SelectField
                label="Preference type"
                value={prefType}
                onChange={(v) => setPrefType(v as PrefType)}
                options={["none", "non-participating", "participating"]}
              />
              {prefType !== "none" && (
                <>
                  <SliderField
                    label="Preference multiple"
                    value={prefMultiple}
                    onChange={setPrefMultiple}
                    min={0}
                    max={3}
                    step={0.5}
                    format={(v) => `${v.toFixed(1)}×`}
                  />
                  <NumberField
                    label="Senior preferences ahead of you"
                    value={seniorPref}
                    onChange={setSeniorPref}
                    suffix="₹ Cr"
                  />
                  {prefType === "participating" && (
                    <SliderField
                      label="Participation cap (0 = uncapped)"
                      value={participationCap}
                      onChange={setParticipationCap}
                      min={0}
                      max={5}
                      step={0.5}
                      format={(v) => (v > 0 ? `${v.toFixed(1)}×` : "uncapped")}
                    />
                  )}
                  <p className="text-xs text-slate-400">
                    {model.prefUplift > 0.05 ? (
                      <>
                        Preference is{" "}
                        <strong className="text-emerald-700">in the money</strong>{" "}
                        at the target exit — it adds{" "}
                        <strong className="text-slate-600">
                          {money(model.prefUplift, 1)}
                        </strong>{" "}
                        vs pro-rata ({money(model.exitAsConverted, 1)} as-converted).
                      </>
                    ) : (
                      <>
                        At the target exit you convert to common —{" "}
                        {money(model.exitCplValue, 1)} pro-rata, preference not
                        triggered. It protects the downside.
                      </>
                    )}
                  </p>
                </>
              )}
            </FieldGroup>

            <FieldGroup title="Fund economics (net proceeds)">
              <p className="text-xs text-slate-500">
                What gross exit proceeds run through to reach LPs. Deal-by-deal
                waterfall: capital + preferred return first, then carry on the
                profit above it.
              </p>
              <SliderField
                label="Carried interest"
                value={carryPct}
                onChange={setCarryPct}
                min={0}
                max={30}
                step={1}
                format={(v) => pct(v, 0)}
              />
              <SliderField
                label="Preferred return (hurdle)"
                value={hurdlePct}
                onChange={setHurdlePct}
                min={0}
                max={15}
                step={0.5}
                format={(v) => (v > 0 ? `${pct(v, 1)} IRR` : "none")}
              />
              <SliderField
                label="Transaction costs"
                value={txnCostPct}
                onChange={setTxnCostPct}
                min={0}
                max={10}
                step={0.25}
                format={(v) => pct(v, 2)}
              />
              <p className="text-xs text-slate-400">
                Net to LPs:{" "}
                <strong className="text-slate-600">
                  {money(model.netProceeds, 1)}
                </strong>{" "}
                ({model.netMoic.toFixed(2)}× net vs {model.moic.toFixed(2)}×
                gross) · {pct(model.feeDrag * 100, 1)} total drag.
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
                    Indigo line = realized history · green area = projected
                    enterprise value (left axis) · dark line = Cactus
                    Partners&apos; equity stake (right axis) · amber line =
                    invested capital — the gap to it is your MOIC
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
                      {model.hasHistory && (
                        <ReferenceLine
                          yAxisId="left"
                          x={currentYear}
                          stroke="#6366f1"
                          strokeDasharray="3 3"
                          label={{
                            value: "Today",
                            position: "top",
                            fill: "#6366f1",
                            fontSize: 11,
                          }}
                        />
                      )}
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
                        name="Enterprise value (left axis)"
                        stroke="#059669"
                        strokeWidth={3}
                        fill="url(#valFill)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                      {model.hasHistory && (
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="actualValuation"
                          name="Realized history"
                          stroke="#6366f1"
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 0, fill: "#6366f1" }}
                          activeDot={{ r: 5, strokeWidth: 0 }}
                          connectNulls
                        />
                      )}
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
                        name="Cactus Partners equity stake (right axis)"
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
                            point.isExit
                              ? "bg-emerald-50/50"
                              : point.isActual
                              ? "bg-indigo-50/30"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {point.year}
                            {point.isExit && (
                              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                EXIT
                              </span>
                            )}
                            {point.isActual && (
                              <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                ACTUAL
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
                            {money(point.valuation ?? point.actualValuation ?? 0, 1)}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {point.isActual ? (
                              <span className="text-slate-400">—</span>
                            ) : point.stakeValue === null ? (
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

            {/* ── Year inspector ────────────────────────────── */}
            <YearInspector
              snapshot={snapshot}
              year={inspectYear}
              min={inspectMin}
              max={inspectMax}
              onChange={setInspectYear}
              onToday={() => setInspectYear(currentYear)}
              onExit={() => setInspectYear(exitYear)}
              money={money}
            />

            {/* ── Current → Target variance ─────────────────── */}
            <VariancePanel
              rows={[
                {
                  label: "Enterprise value",
                  current: money(model.currentValuation, 0),
                  target: money(model.exitValuation, 0),
                  delta: model.exitValuation - model.currentValuation,
                  format: (v) => money(v, 0),
                },
                {
                  label: "− Net debt",
                  current: money(model.currentNetDebt, 0),
                  target: money(model.exitNetDebt, 0),
                  delta: model.exitNetDebt - model.currentNetDebt,
                  format: (v) => money(v, 0),
                },
                {
                  label: "Equity value",
                  current: money(model.currentEquityValue, 0),
                  target: money(model.exitEquityValue, 0),
                  delta: model.exitEquityValue - model.currentEquityValue,
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
                  label: "Revenue (at exit)",
                  current: money(currentRevenue, 0),
                  target: money(model.effectiveExitRevenue, 0),
                  delta: model.effectiveExitRevenue - currentRevenue,
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
                <StatRow
                  label={
                    model.effectiveWeight > 0
                      ? "Exit revenue (blended)"
                      : "Target revenue"
                  }
                  value={money(model.effectiveExitRevenue, 0)}
                />
                <StatRow label="× Target multiple" value={mult(targetMultiple)} />
                <StatRow
                  label="= Exit valuation"
                  value={money(model.exitValuation, 0)}
                  emphasis
                />
              </BreakdownCard>

              <BreakdownCard title="Enterprise → equity value">
                <StatRow
                  label="Exit enterprise value"
                  value={money(model.exitValuation, 0)}
                />
                <StatRow
                  label="− Net debt at exit"
                  value={money(model.exitNetDebt, 0)}
                  tone={model.exitNetDebt > 0 ? "down" : undefined}
                />
                <StatRow
                  label="= Equity value at exit"
                  value={money(model.exitEquityValue, 0)}
                  emphasis
                />
                <p className="pt-1 text-xs text-slate-400">
                  Your stake claims equity, not EV. Net debt walks from{" "}
                  {money(model.currentNetDebt, 0)} today to{" "}
                  {money(model.exitNetDebt, 0)} at exit
                  {model.exitNetDebt < 0 && " (net cash — lifts equity above EV)"}
                  .
                </p>
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
                <StatRow label="MOIC · gross" value={`${model.moic.toFixed(2)}×`} />
                <StatRow
                  label="MOIC · net to LP"
                  value={`${model.netMoic.toFixed(2)}×`}
                  tone={model.netMoic >= 1 ? "up" : "down"}
                />
                <StatRow
                  label="Forward IRR · gross"
                  value={pct(model.forwardIrr * 100, 1)}
                  tone={model.forwardIrr >= 0 ? "up" : "down"}
                />
                <StatRow
                  label="Forward IRR · net to LP"
                  value={pct(model.netForwardIrr * 100, 1)}
                  tone={model.netForwardIrr >= 0 ? "up" : "down"}
                />
                <StatRow label="Holding period" value={`${model.years} years`} />
                <StatRow
                  label="Projected revenue CAGR"
                  value={pct(model.impliedCagr * 100)}
                />
              </BreakdownCard>

              {model.hasHistory && (
                <BreakdownCard title="Plan vs track record">
                  <StatRow
                    label={`Historical CAGR (${model.histSpan}y)`}
                    value={pct((model.historicalCagr ?? 0) * 100)}
                  />
                  <StatRow
                    label="Plan-implied CAGR"
                    value={pct(model.planCagr * 100)}
                  />
                  <StatRow
                    label="Plan exit value (your stake)"
                    value={money(model.planExitCplValue, 1)}
                  />
                  <StatRow
                    label="Track-record-adjusted exit value"
                    value={money(model.exitCplValue, 1)}
                  />
                  <StatRow
                    label={`Adjusted MOIC (vs ${model.planMoic.toFixed(2)}× plan)`}
                    value={`${model.moic.toFixed(2)}×`}
                    tone={model.moic >= model.planMoic ? "up" : "down"}
                    emphasis
                  />
                  <p className="pt-1 text-xs text-slate-400">
                    {model.historicalCagr !== null && model.historicalCagr > 0
                      ? (() => {
                          const ratio = model.planCagr / model.historicalCagr;
                          if (ratio > 1.25)
                            return `The plan asks for ${ratio.toFixed(
                              1
                            )}× the company's realized growth — aggressive vs the track record.`;
                          if (ratio < 0.8)
                            return `The plan sits below realized growth — conservative; history suggests upside.`;
                          return `The plan is broadly in line with realized growth — well supported by the track record.`;
                        })()
                      : "Add past years to benchmark the plan against realized growth."}
                  </p>
                </BreakdownCard>
              )}

              <BreakdownCard title="Net-to-LP waterfall">
                <StatRow
                  label="Gross exit proceeds (your stake)"
                  value={money(model.exitCplValue, 1)}
                />
                <StatRow
                  label={`− Transaction costs (${pct(txnCostPct, 2)})`}
                  value={`(${money(model.txnCostAmount, 1)})`}
                  tone="down"
                />
                <StatRow
                  label={`− Carried interest (${pct(carryPct, 0)}${
                    hurdlePct > 0 ? ` over ${pct(hurdlePct, 1)} pref` : ""
                  })`}
                  value={`(${money(model.carryAmount, 1)})`}
                  tone="down"
                />
                <StatRow
                  label="= Net proceeds to LPs"
                  value={money(model.netProceeds, 1)}
                  emphasis
                />
                <p className="pt-1 text-xs text-slate-400">
                  {model.netMoic.toFixed(2)}× net vs {model.moic.toFixed(2)}×
                  gross · {pct(model.feeDrag * 100, 1)}{" "}
                  of gross proceeds lost to costs &amp; carry
                  {hurdlePct > 0 &&
                    ` · preferred return ${money(model.prefAmount, 1)}`}
                  .{" "}
                  {model.carryAmount === 0 && model.grossProfit > 0 && hurdlePct > 0
                    ? "Profit sits below the hurdle — no carry due."
                    : ""}
                </p>
              </BreakdownCard>
            </div>
          </section>
        </section>

        {/* ── Scenario analysis ─────────────────────────────── */}
        <ScenarioAnalysis
          cases={scenarios.cases}
          expected={scenarios.expected}
          probSum={scenarios.probSum}
          money={money}
          onEditCase={editCase}
          onEditProb={editProb}
          onReset={resetScenarios}
        />

        {/* ── Goal-seek + sensitivity ───────────────────────── */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <GoalSeekPanel
            metric={goalMetric}
            target={goalTarget}
            lever={goalLever}
            result={goalSeek}
            onMetric={setGoalMetric}
            onTarget={setGoalTarget}
            onLever={setGoalLever}
            money={money}
          />
          <SensitivityPanel
            data={sensitivity}
            hurdle={HURDLE_MOIC}
            money={money}
          />
        </div>

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
  theme?: "neutral" | "current" | "target" | "history";
}) {
  const isTarget = theme === "target";
  const headerColor =
    theme === "target"
      ? "text-emerald-600"
      : theme === "current"
      ? "text-teal-700"
      : theme === "history"
      ? "text-indigo-600"
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
              : theme === "history"
              ? "bg-indigo-500"
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
      <div className="flex items-baseline justify-between gap-2">
        {label && (
          <span className="text-sm font-medium text-slate-700">{label}</span>
        )}
        <InlineNumber
          value={value}
          onChange={onChange}
          disabled={disabled}
          hint={format(value)}
        />
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

// Editable readout for a slider: type an exact value (decimals allowed, and you
// can go beyond the slider's min/max). Shows the formatted value as a hint so
// units / currency stay visible. Same clear-while-typing pattern as NumberField.
function InlineNumber({
  value,
  onChange,
  disabled,
  hint,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (Number(text) !== value) setText(String(value));
  }
  const showHint = hint !== undefined && hint !== String(value);
  return (
    <span className="flex items-baseline gap-1.5">
      {showHint && (
        <span className="text-xs tabular-nums text-slate-400">{hint}</span>
      )}
      <input
        type="number"
        step="any"
        inputMode="decimal"
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
        className="w-20 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-right text-sm font-semibold tabular-nums text-slate-900 outline-none transition hover:border-slate-200 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed"
      />
    </span>
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

// Include / exclude a valuation driver. Disabled when it's the last one left
// on (you can't exclude both — the company needs something to be valued on).
function DriverToggle({
  label,
  detail,
  checked,
  lastOne,
  onToggle,
}: {
  label: string;
  detail: string;
  checked: boolean;
  lastOne: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={lastOne}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        checked
          ? "border-teal-300 bg-teal-50/70"
          : "border-slate-200 bg-slate-50/60 opacity-70 hover:opacity-100"
      } ${lastOne ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold text-white transition ${
          checked
            ? "border-teal-600 bg-teal-600"
            : "border-slate-300 bg-white text-transparent"
        }`}
        aria-hidden
      >
        ✓
      </span>
      <span className="flex flex-1 items-baseline justify-between gap-2">
        <span
          className={`text-sm font-semibold ${
            checked ? "text-slate-900" : "text-slate-500 line-through"
          }`}
        >
          {label}
        </span>
        <span className="text-xs tabular-nums text-slate-400">{detail}</span>
      </span>
    </button>
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

// Type a year → read the full projected picture for it.
function YearInspector({
  snapshot,
  year,
  min,
  max,
  onChange,
  onToday,
  onExit,
  money,
}: {
  snapshot: YearSnapshot;
  year: number;
  min: number;
  max: number;
  onChange: (year: number) => void;
  onToday: () => void;
  onExit: () => void;
  money: (valueCr: number, digits?: number) => string;
}) {
  const phaseMeta: Record<YearPhase, { label: string; chip: string }> = {
    historical: { label: "Actual", chip: "bg-indigo-100 text-indigo-700" },
    current: { label: "Today", chip: "bg-teal-100 text-teal-700" },
    projected: { label: "Projected", chip: "bg-emerald-100 text-emerald-700" },
    exit: { label: "Exit year", chip: "bg-emerald-600 text-white" },
    "post-exit": {
      label: "Post-exit · realized",
      chip: "bg-slate-200 text-slate-600",
    },
  };
  const meta = phaseMeta[snapshot.phase];
  const t = snapshot.yearsFromToday;
  const horizon =
    t === 0 ? "this year" : t > 0 ? `in ${t}y` : `${Math.abs(t)}y ago`;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Year inspector</h2>
          <p className="mt-1 text-sm text-slate-500">
            Type any year to read the full projection for it — financials,
            valuation, your stake, and the mark-to-date.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.chip}`}
        >
          {year} · {meta.label} · {horizon}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <SliderField
            label="Inspect year"
            value={year}
            onChange={(v) => onChange(Math.round(v))}
            min={min}
            max={max}
            step={1}
            format={(v) => String(v)}
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onToday}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
          >
            Today
          </button>
          <button
            onClick={onExit}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            Exit
          </button>
        </div>
      </div>

      {!snapshot.hasData ? (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
          No actuals recorded for {year}. Add it in the{" "}
          <span className="font-semibold text-indigo-600">Track record</span>{" "}
          section, or pick a year from today ({"≥"} the current year) to see the
          projection.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InspectorTile
            label="Revenue"
            value={money(snapshot.revenue, 1)}
            detail={`EBITDA margin ${pct(snapshot.margin * 100)}`}
          />
          <InspectorTile
            label="EBITDA"
            value={money(snapshot.ebitda, 1)}
            detail={`${mult(snapshot.impliedEbitdaMultiple)} implied multiple`}
          />
          <InspectorTile
            label="Enterprise value"
            value={money(snapshot.valuation, 0)}
            detail={`${mult(snapshot.impliedRevMultiple)} revenue multiple`}
          />
          <InspectorTile
            label="Equity value"
            value={money(snapshot.equityValue, 0)}
            detail={`EV − net debt ${money(snapshot.netDebt, 0)}`}
          />
          <InspectorTile
            label="Your stake"
            value={snapshot.stakePct === null ? "Realized" : pct(snapshot.stakePct)}
            detail={
              snapshot.stakePct === null
                ? "position sold at exit"
                : "after dilution to this year"
            }
            muted={snapshot.stakePct === null}
          />
          <InspectorTile
            label="Your position value"
            value={
              snapshot.positionValue === null
                ? "Exited"
                : money(snapshot.positionValue, 1)
            }
            detail={
              snapshot.positionValue === null
                ? "no longer held"
                : "equity value × stake"
            }
            muted={snapshot.positionValue === null}
          />
          <InspectorTile
            label="Mark-to-date MOIC"
            value={
              snapshot.moicToDate === null
                ? "—"
                : `${snapshot.moicToDate.toFixed(2)}×`
            }
            detail={
              snapshot.gainOverInvested === null
                ? "position realized"
                : `${snapshot.gainOverInvested >= 0 ? "+" : ""}${money(
                    snapshot.gainOverInvested,
                    1
                  )} vs invested`
            }
            tone={
              snapshot.moicToDate === null
                ? undefined
                : snapshot.moicToDate >= 1
                ? "up"
                : "down"
            }
            muted={snapshot.moicToDate === null}
          />
        </div>
      )}
    </div>
  );
}

function InspectorTile({
  label,
  value,
  detail,
  tone,
  muted,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "up" | "down";
  muted?: boolean;
}) {
  const valueColor = muted
    ? "text-slate-400"
    : tone === "up"
    ? "text-emerald-600"
    : tone === "down"
    ? "text-rose-600"
    : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

// Solve for the exit multiple / revenue needed to clear a target return.
function GoalSeekPanel({
  metric,
  target,
  lever,
  result,
  onMetric,
  onTarget,
  onLever,
  money,
}: {
  metric: "netMoic" | "moic";
  target: number;
  lever: "multiple" | "revenue";
  result: { feasible: boolean; required: number; baseValue: number; atMax: number };
  onMetric: (m: "netMoic" | "moic") => void;
  onTarget: (t: number) => void;
  onLever: (l: "multiple" | "revenue") => void;
  money: (valueCr: number, digits?: number) => string;
}) {
  const fmt = (v: number) => (lever === "multiple" ? mult(v) : money(v, 0));
  const metricLabel = metric === "netMoic" ? "net MOIC" : "gross MOIC";
  const delta = result.required - result.baseValue;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
      <h2 className="text-lg font-semibold text-slate-900">Break-even solver</h2>
      <p className="mt-1 text-sm text-slate-500">
        What exit assumption clears your target return, holding everything else
        at base.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Target</span>
          <div className="flex items-center gap-1.5">
            <div className="w-20">
              <MiniNumber value={target} step={0.5} suffix="×" onChange={onTarget} />
            </div>
          </div>
        </label>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Metric
          </span>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                ["netMoic", "Net MOIC"],
                ["moic", "Gross MOIC"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => onMetric(k)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  metric === k
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Solve for
          </span>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                ["multiple", "Exit multiple"],
                ["revenue", "Exit revenue"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => onLever(k)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  lever === k
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
        {result.feasible ? (
          <>
            <p className="text-sm text-slate-600">
              To reach{" "}
              <strong className="text-slate-900">
                {target.toFixed(1)}× {metricLabel}
              </strong>
              , you need an exit {lever === "multiple" ? "multiple" : "revenue"}{" "}
              of
            </p>
            <p className="mt-1 text-3xl font-bold text-emerald-700">
              {fmt(result.required)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              vs your base {fmt(result.baseValue)} ·{" "}
              <span className={delta > 0 ? "text-rose-600" : "text-emerald-600"}>
                {delta > 0 ? "needs +" : "has "}
                {fmt(Math.abs(delta))} {delta > 0 ? "more" : "of headroom"}
              </span>
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-rose-700">
              Out of reach on {lever === "multiple" ? "multiple" : "revenue"}{" "}
              alone.
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Even at the maximum, {metricLabel} tops out at{" "}
              <strong>{result.atMax.toFixed(2)}×</strong> — below your{" "}
              {target.toFixed(1)}× target. Pull another lever (stake, costs, or
              the other axis).
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Net MOIC across a grid of exit multiple × revenue.
function SensitivityPanel({
  data,
  hurdle,
  money,
}: {
  data: { mults: number[]; revs: number[]; grid: number[][] };
  hurdle: number;
  money: (valueCr: number, digits?: number) => string;
}) {
  const tone = (v: number) =>
    v < 1
      ? "bg-rose-100 text-rose-700"
      : v < hurdle
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";
  const mid = 2; // factor 1.0 — the base cell

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
      <h2 className="text-lg font-semibold text-slate-900">
        Sensitivity · net MOIC
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Net MOIC across exit multiple (rows) × exit revenue (columns). Green
        clears your {hurdle.toFixed(1)}× hurdle; the bordered cell is your base.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-center text-sm">
          <thead>
            <tr>
              <th className="p-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                mult ↓ / rev →
              </th>
              {data.revs.map((r, j) => (
                <th
                  key={j}
                  className="p-1.5 text-xs font-semibold text-slate-500"
                >
                  {money(r, 0)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.grid.map((row, i) => (
              <tr key={i}>
                <td className="p-1.5 text-left text-xs font-semibold text-slate-500">
                  {mult(data.mults[i])}
                </td>
                {row.map((v, j) => (
                  <td key={j} className="p-1">
                    <div
                      className={`rounded-lg py-2 font-semibold tabular-nums ${tone(
                        v
                      )} ${
                        i === mid && j === mid
                          ? "ring-2 ring-slate-900 ring-offset-1"
                          : ""
                      }`}
                    >
                      {v.toFixed(2)}×
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ScenarioCaseResult = {
  key: "bear" | "base" | "bull";
  label: string;
  tone: "bear" | "base" | "bull";
  editable: boolean;
  revenue: number;
  multiple: number;
  exitYear: number;
  probability: number;
  out: ReturnType<typeof exitOutcome>;
};

type ScenarioExpected = {
  exitCplValue: number;
  moic: number;
  netMoic: number;
  forwardIrr: number;
  netForwardIrr: number;
  netProceeds: number;
};

function ScenarioAnalysis({
  cases,
  expected,
  probSum,
  money,
  onEditCase,
  onEditProb,
  onReset,
}: {
  cases: ScenarioCaseResult[];
  expected: ScenarioExpected;
  probSum: number;
  money: (valueCr: number, digits?: number) => string;
  onEditCase: (key: "bear" | "bull", patch: Partial<ScenarioCase>) => void;
  onEditProb: (key: "bear" | "base" | "bull", value: number) => void;
  onReset: () => void;
}) {
  const toneText: Record<string, string> = {
    bear: "text-rose-600",
    base: "text-slate-700",
    bull: "text-emerald-600",
  };
  const toneChip: Record<string, string> = {
    bear: "bg-rose-100 text-rose-700",
    base: "bg-slate-200 text-slate-700",
    bull: "bg-emerald-100 text-emerald-700",
  };
  const probOff = Math.abs(probSum - 100) > 0.01;
  const grid =
    "grid grid-cols-[1.6fr_repeat(4,minmax(86px,1fr))] gap-x-2 px-4";

  // A computed output row: bear / base / bull then the probability-weighted
  // expected value.
  const OutRow = ({
    label,
    render,
    expectedValue,
    emphasis,
  }: {
    label: string;
    render: (o: ReturnType<typeof exitOutcome>) => string;
    expectedValue: string;
    emphasis?: boolean;
  }) => (
    <div
      className={`${grid} items-baseline border-t border-slate-100 py-2.5 text-sm transition hover:bg-slate-50/60 ${
        emphasis ? "font-semibold" : ""
      }`}
    >
      <span className="text-slate-500">{label}</span>
      {cases.map((c) => (
        <span
          key={c.key}
          className="text-right tabular-nums text-slate-700"
        >
          {render(c.out)}
        </span>
      ))}
      <span className="rounded-md bg-indigo-50 px-1 text-right font-semibold tabular-nums text-indigo-700">
        {expectedValue}
      </span>
    </div>
  );

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Scenario analysis
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Bear / Base / Bull cases run through the same returns engine. Base
            tracks your live targets; edit Bear &amp; Bull and the probabilities
            to get a probability-weighted expected return.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              probOff
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            Σ {pct(probSum, 0)}
            {probOff && " · normalized"}
          </span>
          <button
            onClick={onReset}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            ↻ Reset from base
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[640px] overflow-hidden rounded-2xl border border-slate-200">
          {/* Header */}
          <div className={`${grid} bg-slate-50 py-3`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Scenario
            </span>
            {cases.map((c) => (
              <span key={c.key} className="flex justify-end">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    toneChip[c.tone]
                  }`}
                >
                  {c.label}
                  {!c.editable && (
                    <span className="ml-1 font-medium opacity-70">live</span>
                  )}
                </span>
              </span>
            ))}
            <span className="text-right text-xs font-semibold uppercase tracking-wide text-indigo-500">
              Expected
            </span>
          </div>

          {/* Probability (editable for every case) */}
          <div className={`${grid} items-center border-t border-slate-100 py-2`}>
            <span className="text-sm text-slate-500">Probability</span>
            {cases.map((c) => (
              <div key={c.key} className="flex justify-end">
                <div className="w-[78px]">
                  <MiniNumber
                    value={c.probability}
                    step={5}
                    suffix="%"
                    onChange={(v) => onEditProb(c.key, v)}
                  />
                </div>
              </div>
            ))}
            <span
              className={`text-right text-sm font-semibold tabular-nums ${
                probOff ? "text-amber-600" : "text-slate-400"
              }`}
            >
              {pct(probSum, 0)}
            </span>
          </div>

          {/* Editable assumptions: revenue, multiple, exit year */}
          <ScenarioInputRow
            label="Exit revenue"
            grid={grid}
            cases={cases}
            render={(c) => money(c.revenue, 0)}
            edit={(c) => (
              <MiniNumber
                value={c.revenue}
                step={5}
                onChange={(v) => onEditCase(c.key as "bear" | "bull", { revenue: v })}
              />
            )}
          />
          <ScenarioInputRow
            label="Exit multiple (× rev)"
            grid={grid}
            cases={cases}
            render={(c) => mult(c.multiple)}
            edit={(c) => (
              <MiniNumber
                value={c.multiple}
                step={0.1}
                onChange={(v) =>
                  onEditCase(c.key as "bear" | "bull", { multiple: v })
                }
              />
            )}
          />
          <ScenarioInputRow
            label="Exit year"
            grid={grid}
            cases={cases}
            render={(c) => String(c.exitYear)}
            edit={(c) => (
              <MiniNumber
                value={c.exitYear}
                step={1}
                onChange={(v) =>
                  onEditCase(c.key as "bear" | "bull", { exitYear: v })
                }
              />
            )}
          />

          {/* Computed outcomes */}
          <OutRow
            label="Exit value (your stake)"
            render={(o) => money(o.exitCplValue, 1)}
            expectedValue={money(expected.exitCplValue, 1)}
          />
          <OutRow
            label="MOIC · gross"
            render={(o) => `${o.moic.toFixed(2)}×`}
            expectedValue={`${expected.moic.toFixed(2)}×`}
          />
          <OutRow
            label="MOIC · net to LP"
            render={(o) => `${o.netMoic.toFixed(2)}×`}
            expectedValue={`${expected.netMoic.toFixed(2)}×`}
            emphasis
          />
          <OutRow
            label="Forward IRR · gross"
            render={(o) => pct(o.forwardIrr * 100, 1)}
            expectedValue={pct(expected.forwardIrr * 100, 1)}
          />
          <OutRow
            label="Forward IRR · net to LP"
            render={(o) => pct(o.netForwardIrr * 100, 1)}
            expectedValue={pct(expected.netForwardIrr * 100, 1)}
            emphasis
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Expected = probability-weighted across the three cases (normalized to{" "}
        {pct(probSum, 0)}). Each case flows through dilution, the track-record
        blend, and the net-to-LP waterfall.
      </p>
    </section>
  );
}

// One editable assumption row in the scenario grid — Bear & Bull get inputs,
// Base shows its live value read-only.
function ScenarioInputRow({
  label,
  grid,
  cases,
  render,
  edit,
}: {
  label: string;
  grid: string;
  cases: ScenarioCaseResult[];
  render: (c: ScenarioCaseResult) => string;
  edit: (c: ScenarioCaseResult) => React.ReactNode;
}) {
  return (
    <div className={`${grid} items-center border-t border-slate-100 py-2`}>
      <span className="text-sm text-slate-500">{label}</span>
      {cases.map((c) => (
        <div key={c.key} className="flex justify-end">
          {c.editable ? (
            <div className="w-[78px]">{edit(c)}</div>
          ) : (
            <span className="py-1 pr-1.5 text-right text-sm tabular-nums text-slate-500">
              {render(c)}
            </span>
          )}
        </div>
      ))}
      <span className="text-right text-sm tabular-nums text-slate-300">—</span>
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

  const rows = payload.filter(
    (item) => item.value !== null && item.value !== undefined
  );
  if (!rows.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((item) => (
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
