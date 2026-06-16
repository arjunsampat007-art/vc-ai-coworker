"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
    projectedExitYear !== null
      ? projectedExitYear - targetExitYear
      : null;

  const overallStatus =
    projectedExitYear === null
      ? "Target Not Reached"
      : projectedExitYear < targetExitYear
      ? "Ahead of Plan"
      : projectedExitYear === targetExitYear
      ? "On Track"
      : "Behind Plan";

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">
            VC Exit Timing Dashboard
          </h1>

          <p className="mt-2 text-lg text-slate-600">
            Compare the targeted exit path against the company&apos;s current
            projected trajectory.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Target Exit"
            value={`${targetExitYear}`}
            detail={`₹${targetExitValue.toFixed(0)} Cr target`}
          />

          <MetricCard
            label="Projected Exit"
            value={
              projectedExitYear !== null
                ? `${projectedExitYear}`
                : "Not reached"
            }
            detail="First year projected value reaches target"
          />

          <MetricCard
            label="Exit Timing"
            value={
              delayYears === null
                ? "Outside forecast"
                : delayYears > 0
                ? `${delayYears} years late`
                : delayYears < 0
                ? `${Math.abs(delayYears)} years early`
                : "On time"
            }
            detail="Compared with target exit year"
          />

          <MetricCard
            label="Status"
            value={overallStatus}
            detail={`Gap at target date: ${
              gapAtTargetExit >= 0 ? "+" : ""
            }₹${gapAtTargetExit.toFixed(1)} Cr`}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">
              Exit Assumptions
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Change an input and the analysis updates automatically.
            </p>

            <div className="mt-6 space-y-5">
              <InputField
                label="Entry valuation"
                value={entryValuation}
                onChange={setEntryValuation}
                suffix="₹ Cr"
              />

              <InputField
                label="Current valuation"
                value={currentValuation}
                onChange={setCurrentValuation}
                suffix="₹ Cr"
              />

              <InputField
                label="Target exit value"
                value={targetExitValue}
                onChange={setTargetExitValue}
                suffix="₹ Cr"
              />

              <InputField
                label="Current year"
                value={currentYear}
                onChange={setCurrentYear}
              />

              <InputField
                label="Target exit year"
                value={targetExitYear}
                onChange={setTargetExitYear}
              />

              <InputField
                label="Projected annual growth"
                value={projectedGrowthRate}
                onChange={setProjectedGrowthRate}
                suffix="%"
              />

              <InputField
                label="Forecast end year"
                value={forecastEndYear}
                onChange={setForecastEndYear}
              />
            </div>
          </aside>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  Target Exit Path vs Current Trend
                </h2>

                <p className="mt-1 text-slate-500">
                  Values shown in ₹ crore.
                </p>
              </div>

              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  onClick={() => setViewMode("graph")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    viewMode === "graph"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Graph
                </button>

                <button
                  onClick={() => setViewMode("table")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    viewMode === "table"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Table
                </button>
              </div>
            </div>

            {viewMode === "graph" ? (
              <div className="mt-8 h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={forecastData}
                    margin={{
                      top: 10,
                      right: 30,
                      left: 10,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `₹${value}Cr`}
                    />

                    <Tooltip
                      formatter={(value, name) => [
                        `₹${Number(value).toFixed(1)} Cr`,
                        name === "targetValue"
                          ? "Target path"
                          : "Current projection",
                      ]}
                    />

                    <Legend />

                    <ReferenceLine
                      x={targetExitYear}
                      strokeDasharray="5 5"
                      label="Target exit year"
                    />

                    <Line
                      type="monotone"
                      dataKey="targetValue"
                      name="Target exit path"
                      stroke="#0f172a"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />

                    <Line
                      type="monotone"
                      dataKey="projectedValue"
                      name="Current projected trend"
                      stroke="#2563eb"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mt-8 overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-sm text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Year</th>
                      <th className="px-4 py-3 font-medium">Target Value</th>
                      <th className="px-4 py-3 font-medium">
                        Projected Value
                      </th>
                      <th className="px-4 py-3 font-medium">Gap</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {forecastData.map((point) => (
                      <tr
                        key={point.year}
                        className="border-t border-slate-100"
                      >
                        <td className="px-4 py-4 font-medium text-slate-900">
                          {point.year}
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          ₹{point.targetValue.toFixed(1)} Cr
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          ₹{point.projectedValue.toFixed(1)} Cr
                        </td>

                        <td
                          className={`px-4 py-4 font-medium ${
                            point.gap >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {point.gap >= 0 ? "+" : ""}
                          ₹{point.gap.toFixed(1)} Cr
                        </td>

                        <td className="px-4 py-4">
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

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            Exit Interpretation
          </h2>

          <p className="mt-3 text-slate-600">
            At the current projected annual growth rate of{" "}
            <strong>{projectedGrowthRate}%</strong>, the company is expected to
            reach the ₹{targetExitValue.toFixed(0)} Cr exit target in{" "}
            <strong>
              {projectedExitYear !== null
                ? projectedExitYear
                : "a year outside the current forecast"}
            </strong>
            .
          </p>

          <p className="mt-2 text-slate-600">
            The planned exit year is <strong>{targetExitYear}</strong>. The
            current model therefore classifies the investment as{" "}
            <strong>{overallStatus}</strong>.
          </p>
        </section>
      </div>
    </main>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
};

function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>

      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>

      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

type InputFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
};

function InputField({
  label,
  value,
  onChange,
  suffix,
}: InputFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>

      <div className="mt-2 flex items-center rounded-xl border border-slate-300 bg-white px-3">
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full py-3 outline-none"
        />

        {suffix && (
          <span className="whitespace-nowrap text-sm text-slate-500">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function StatusBadge({
  status,
}: {
  status: ForecastPoint["status"];
}) {
  const styles = {
    Ahead: "bg-emerald-100 text-emerald-700",
    "On Track": "bg-amber-100 text-amber-700",
    Behind: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}