"use client";

import { useMemo, useState } from "react";
import {
  Area,
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

type ViewMode = "graph" | "table";

type ForecastPoint = {
  year: number;
  targetValue: number;
  projectedValue: number;
  gap: number;
  status: "Ahead" | "On Track" | "Behind";
};

type OverallStatus =
  | "Ahead of Plan"
  | "On Track"
  | "Behind Plan"
  | "Target Not Reached";

const inr = (value: number, digits = 0) =>
  `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} Cr`;

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("graph");

  const [entryValuation, setEntryValuation] = useState(40);
  const [currentValuation, setCurrentValuation] = useState(55);
  const [targetExitValue, setTargetExitValue] = useState(240);

  const [currentYear, setCurrentYear] = useState(2026);
  const [targetExitYear, setTargetExitYear] = useState(2029);

  const [projectedGrowthRate, setProjectedGrowthRate] = useState(35);
  const [forecastEndYear, setForecastEndYear] = useState(2034);

  const forecastData = useMemo<ForecastPoint[]>(() => {
    const years: ForecastPoint[] = [];

    const targetYearsRemaining = Math.max(targetExitYear - currentYear, 1);

    const requiredTargetGrowthRate =
      Math.pow(targetExitValue / currentValuation, 1 / targetYearsRemaining) - 1;

    for (let year = currentYear; year <= forecastEndYear; year++) {
      const yearsFromNow = year - currentYear;

      const projectedValue =
        currentValuation *
        Math.pow(1 + projectedGrowthRate / 100, yearsFromNow);

      let targetValue: number;

      if (year <= targetExitYear) {
        targetValue =
          currentValuation *
          Math.pow(1 + requiredTargetGrowthRate, yearsFromNow);
      } else {
        targetValue = targetExitValue;
      }

      const gap = projectedValue - targetValue;

      let status: ForecastPoint["status"] = "On Track";

      if (gap > targetValue * 0.05) {
        status = "Ahead";
      } else if (gap < -targetValue * 0.05) {
        status = "Behind";
      }

      years.push({
        year,
        targetValue: Number(targetValue.toFixed(1)),
        projectedValue: Number(projectedValue.toFixed(1)),
        gap: Number(gap.toFixed(1)),
        status,
      });
    }

    return years;
  }, [
    currentValuation,
    targetExitValue,
    currentYear,
    targetExitYear,
    projectedGrowthRate,
    forecastEndYear,
  ]);

  const projectedExitPoint = forecastData.find(
    (point) => point.projectedValue >= targetExitValue
  );

  const projectedExitYear = projectedExitPoint?.year ?? null;

  const valueAtTargetExitYear = forecastData.find(
    (point) => point.year === targetExitYear
  )?.projectedValue;

  const gapAtTargetExit =
    valueAtTargetExitYear !== undefined
      ? valueAtTargetExitYear - targetExitValue
      : 0;

  const delayYears =
    projectedExitYear !== null ? projectedExitYear - targetExitYear : null;

  const overallStatus: OverallStatus =
    projectedExitYear === null
      ? "Target Not Reached"
      : projectedExitYear < targetExitYear
      ? "Ahead of Plan"
      : projectedExitYear === targetExitYear
      ? "On Track"
      : "Behind Plan";

  const multiple =
    entryValuation > 0 ? targetExitValue / entryValuation : 0;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 text-lg font-bold text-white shadow-lg shadow-indigo-500/30">
              ↗
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Exit Timing Dashboard
              </h1>
              <p className="text-sm text-slate-500">
                Target exit path vs. current projected trajectory
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur">
            <OverallStatusDot status={overallStatus} />
            {overallStatus}
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Target Exit"
            value={`${targetExitYear}`}
            detail={`${inr(targetExitValue)} target value`}
            tone="neutral"
          />

          <MetricCard
            label="Projected Exit"
            value={projectedExitYear !== null ? `${projectedExitYear}` : "—"}
            detail={
              projectedExitYear !== null
                ? "First year value reaches target"
                : "Not reached in forecast window"
            }
            tone={projectedExitYear !== null ? "info" : "danger"}
          />

          <MetricCard
            label="Exit Timing"
            value={
              delayYears === null
                ? "Outside forecast"
                : delayYears > 0
                ? `${delayYears}y late`
                : delayYears < 0
                ? `${Math.abs(delayYears)}y early`
                : "On time"
            }
            detail="vs. planned target year"
            tone={
              delayYears === null
                ? "danger"
                : delayYears > 0
                ? "danger"
                : delayYears < 0
                ? "success"
                : "neutral"
            }
          />

          <MetricCard
            label="Gap at Target Date"
            value={`${gapAtTargetExit >= 0 ? "+" : ""}${inr(
              gapAtTargetExit,
              1
            )}`}
            detail={`Targeting ${multiple.toFixed(1)}× on entry`}
            tone={gapAtTargetExit >= 0 ? "success" : "danger"}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
            <h2 className="text-base font-semibold text-slate-900">
              Exit Assumptions
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Adjust any input — the analysis recalculates instantly.
            </p>

            <div className="mt-6 space-y-5">
              <SliderField
                label="Entry valuation"
                value={entryValuation}
                onChange={setEntryValuation}
                min={1}
                max={200}
                step={1}
                format={(v) => inr(v)}
              />
              <SliderField
                label="Current valuation"
                value={currentValuation}
                onChange={setCurrentValuation}
                min={1}
                max={400}
                step={1}
                format={(v) => inr(v)}
              />
              <SliderField
                label="Target exit value"
                value={targetExitValue}
                onChange={setTargetExitValue}
                min={1}
                max={1000}
                step={5}
                format={(v) => inr(v)}
              />
              <SliderField
                label="Projected annual growth"
                value={projectedGrowthRate}
                onChange={setProjectedGrowthRate}
                min={0}
                max={120}
                step={1}
                format={(v) => `${v}%`}
              />

              <div className="grid grid-cols-3 gap-3 pt-1">
                <YearField
                  label="Current"
                  value={currentYear}
                  onChange={setCurrentYear}
                />
                <YearField
                  label="Target exit"
                  value={targetExitYear}
                  onChange={setTargetExitYear}
                />
                <YearField
                  label="Forecast end"
                  value={forecastEndYear}
                  onChange={setForecastEndYear}
                />
              </div>
            </div>
          </aside>

          <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Target Exit Path vs. Current Trend
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  All values in ₹ crore
                </p>
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
              <div className="mt-6 h-[460px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={forecastData}
                    margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient
                        id="projectedFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#6366f1"
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="100%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
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
                      width={56}
                      tickFormatter={(value) => `₹${value}`}
                    />

                    <Tooltip content={<ChartTooltip />} />

                    <Legend
                      iconType="plainline"
                      wrapperStyle={{ paddingTop: 12, fontSize: 13 }}
                    />

                    <ReferenceLine
                      x={targetExitYear}
                      stroke="#94a3b8"
                      strokeDasharray="5 5"
                      label={{
                        value: "Target exit",
                        position: "top",
                        fill: "#64748b",
                        fontSize: 11,
                      }}
                    />

                    <Area
                      type="monotone"
                      dataKey="projectedValue"
                      name="Current projected trend"
                      stroke="#6366f1"
                      strokeWidth={3}
                      fill="url(#projectedFill)"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />

                    <Line
                      type="monotone"
                      dataKey="targetValue"
                      name="Target exit path"
                      stroke="#0f172a"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
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
                      <th className="px-4 py-3 font-semibold">Target</th>
                      <th className="px-4 py-3 font-semibold">Projected</th>
                      <th className="px-4 py-3 font-semibold">Gap</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastData.map((point) => (
                      <tr
                        key={point.year}
                        className="border-t border-slate-100 transition hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {point.year}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {inr(point.targetValue, 1)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {inr(point.projectedValue, 1)}
                        </td>
                        <td
                          className={`px-4 py-3 font-medium ${
                            point.gap >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {point.gap >= 0 ? "+" : ""}
                          {inr(point.gap, 1)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={point.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>

        <section className="mt-6 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-sky-50/60 p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
              i
            </span>
            <h2 className="text-base font-semibold text-slate-900">
              Exit Interpretation
            </h2>
          </div>

          <p className="mt-3 text-slate-700">
            At a projected annual growth of{" "}
            <strong className="text-slate-900">{projectedGrowthRate}%</strong>,
            the company is expected to reach the{" "}
            <strong className="text-slate-900">{inr(targetExitValue)}</strong>{" "}
            exit target in{" "}
            <strong className="text-slate-900">
              {projectedExitYear !== null
                ? projectedExitYear
                : "a year beyond the current forecast window"}
            </strong>
            .
          </p>

          <p className="mt-2 text-slate-700">
            The planned exit year is{" "}
            <strong className="text-slate-900">{targetExitYear}</strong>, so the
            model currently classifies this investment as{" "}
            <strong className="text-slate-900">{overallStatus}</strong>.
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
  info: { bar: "bg-indigo-500", value: "text-indigo-600" },
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

type SliderFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
};

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: SliderFieldProps) {
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
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600"
      />
    </div>
  );
}

type YearFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function YearField({ label, value, onChange }: YearFieldProps) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
    </label>
  );
}

function StatusBadge({ status }: { status: ForecastPoint["status"] }) {
  const styles: Record<ForecastPoint["status"], string> = {
    Ahead: "bg-emerald-100 text-emerald-700",
    "On Track": "bg-amber-100 text-amber-700",
    Behind: "bg-rose-100 text-rose-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function OverallStatusDot({ status }: { status: OverallStatus }) {
  const color =
    status === "Ahead of Plan"
      ? "bg-emerald-500"
      : status === "On Track"
      ? "bg-amber-500"
      : "bg-rose-500";
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`}
      />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
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
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
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
              {inr(item.value, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
