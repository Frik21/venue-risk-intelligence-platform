import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent } from "@/components/ui/card";

// Shared line-chart card for the Dashboard's trend charts (Tasks
// Completed, Quotes Sent/Pending, Quote Win Rate, Invoices Pending,
// New Clients Onboarded, Operators Onboarded) - one series or two,
// always daily counts (or, with `unit` set, a cumulative percentage)
// within the selected date range. Thin 2px lines, recessive
// gridlines/axes, a legend only when there's more than one series
// (a single series is already named by the card title) - per the
// data-viz method's mark/legend rules.
export function TrendChart({
  title,
  data,
  lines,
  unit,
}: {
  title: string;
  data: Record<string, string | number | null>[];
  lines: { key: string; label: string; color: string }[];
  /** Optional suffix appended to axis ticks and tooltip values, e.g. "%". */
  unit?: string;
}) {
  const config: ChartConfig = Object.fromEntries(
    lines.map((l) => [l.key, { label: l.label, color: l.color }]),
  );
  // "No activity" means every point is null-or-zero, matching the
  // original sum>0 check for the plain-count charts (every value here
  // is non-negative, so sum>0 iff some value is nonzero) while also
  // covering the nullable win-rate case (every bucket null = no
  // decisions yet at all). Known edge case: a win-rate series that's
  // genuinely 0% throughout (every decided quote lost) reads the same
  // as "no decisions yet" - an acceptable tradeoff over a 3rd explicit
  // "activity happened but rate is zero" state.
  const hasActivity = data.some((d) => lines.some((l) => { const v = d[l.key]; return v != null && Number(v) !== 0; }));

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">{title}</h3>
        {!hasActivity ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">No activity in this range yet.</div>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e1e0d9" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                fontSize={11}
                width={28}
                allowDecimals={false}
                {...(unit ? { domain: [0, 100], tickFormatter: (v: number) => `${v}${unit}` } : {})}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="line" formatter={unit ? (value, name) => `${value}${unit} ${name}` : undefined} />} />
              {lines.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
              {lines.map((l) => (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.label}
                  stroke={l.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
