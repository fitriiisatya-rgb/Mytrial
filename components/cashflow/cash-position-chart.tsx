"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatRupiah, formatDateID } from "@/lib/cashflow/format";

export interface CashPositionPoint {
  date: string; // ISO yyyy-mm-dd
  actual: number | null;
  projected: number | null;
}

export function CashPositionChart({ data }: { data: CashPositionPoint[] }) {
  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-sm text-gray-400">Belum ada data cashflow.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#14213D" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#14213D" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E1E4EA" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDateID(d)}
          tick={{ fontSize: 11, fill: "#6B7280" }}
          axisLine={{ stroke: "#E1E4EA" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => (v === 0 ? "0" : `${(v / 1_000_000).toLocaleString("id-ID")}jt`)}
          tick={{ fontSize: 11, fill: "#6B7280" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          formatter={(value: number, name: string) => [formatRupiah(value), name === "actual" ? "Actual" : "Projected"]}
          labelFormatter={(d: string) => formatDateID(d)}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E1E4EA" }}
        />
        <Area type="monotone" dataKey="actual" name="actual" stroke="#14213D" fill="url(#actualFill)" strokeWidth={2} connectNulls={false} dot={false} />
        <Area type="monotone" dataKey="projected" name="projected" stroke="#C9A227" fill="none" strokeWidth={2} strokeDasharray="5 4" connectNulls={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
