import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { fmtTime, fmtPrice, confColor } from "../lib/parser";
import { CHART_MAX_PTS } from "../lib/config";

const WINDOWS = [
  { label: "15m", minutes: 15 },
  { label: "1h",  minutes: 60 },
  { label: "4h",  minutes: 240 },
  { label: "12h", minutes: 720 },
  { label: "24h", minutes: 1440 },
  { label: "sesión", minutes: 0 },
];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const PillCls = { buy: "text-buy border-buy/25 bg-buy/10", sell: "text-sell border-sell/25 bg-sell/10", hold: "text-hold border-hold/25 bg-hold/10" };
  return (
    <div className="bg-card border border-faint rounded-lg p-3 font-mono text-[10px] shadow-xl">
      <p className="text-dim mb-1.5">{d.timeLabel}</p>
      <p className="text-ink font-semibold mb-1">{fmtPrice(d.price)}</p>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-semibold ${PillCls[d.colorKey]}`}>
        {d.arrow} {d.label}
      </span>
      <p className="text-dim mt-1" style={{ color: confColor(d.conf) }}>
        {(d.conf * 100).toFixed(1)}% conf.
      </p>
    </div>
  );
}

export default function PriceChart({ history }) {
  const [window, setWindow] = useState(0);

  const pts = useMemo(() => {
    let filtered = window === 0
      ? history.slice(0, CHART_MAX_PTS)
      : history.filter(p => p.ts >= new Date(Date.now() - window * 60_000)).slice(0, CHART_MAX_PTS);
    return filtered.reverse().map(p => ({
      ...p,
      timeLabel: fmtTime(p.ts),
      priceNum:  p.price,
    }));
  }, [history, window]);

  const hasData = pts.length >= 2;
  const prices  = pts.map(p => p.price);
  const minP    = Math.min(...prices);
  const maxP    = Math.max(...prices);
  const pad     = (maxP - minP) * 0.12 || maxP * 0.001;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="vx-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-4 border-b border-line">
        <span className="font-mono font-semibold text-sub text-[10px] tracking-widest uppercase">
          Gráfica en el tiempo
        </span>
        <div className="flex items-center gap-3">
          {/* Window selector */}
          <div className="flex items-center gap-0.5 bg-card2 border border-faint rounded-md p-0.5">
            {WINDOWS.map(w => (
              <button
                key={w.label}
                onClick={() => setWindow(w.minutes)}
                className={`px-2 py-1 rounded font-mono text-[8px] tracking-wide transition-all ${
                  window === w.minutes
                    ? "bg-faint text-ink font-semibold"
                    : "text-dim hover:text-sub"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3">
            {[["#00d97e","BUY"],["#ff4d6d","SELL"],["#ffb703","HOLD"]].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1.5 font-mono text-[8px] text-dim">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }}/>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-2 pt-3">
        {!hasData ? (
          <div className="h-40 flex items-center justify-center">
            <p className="font-mono text-[8px] text-dim tracking-[2px]">ESPERANDO 2 SEÑALES PARA GRAFICAR...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={pts} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.18}/>
                  <stop offset="70%"  stopColor="#818cf8" stopOpacity={0.04}/>
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0}/>
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke="rgba(30,41,59,.5)" strokeDasharray="0"/>

              <XAxis
                dataKey="timeLabel"
                tick={{ fontFamily: "'IBM Plex Mono'", fontSize: 8, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minP - pad, maxP + pad]}
                tick={{ fontFamily: "'IBM Plex Mono'", fontSize: 9, fill: "#b0bec5" }}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={v => "$" + Math.round(v).toLocaleString("en-US")}
              />

              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(129,140,248,.3)", strokeWidth: 1 }}/>

              <Area
                type="monotone"
                dataKey="priceNum"
                stroke="#818cf8"
                strokeWidth={1.5}
                fill="url(#priceGrad)"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return (
                    <g key={`dot-${props.index}`}>
                      <circle cx={cx} cy={cy} r={7}   fill="rgba(6,10,16,.95)"/>
                      <circle cx={cx} cy={cy} r={7}   fill="none" stroke={payload.hexColor} strokeWidth={1.5}/>
                      <circle cx={cx} cy={cy} r={3.5} fill={payload.hexColor}/>
                      <text x={cx} y={payload.isBuy ? cy - 14 : cy + 18}
                            textAnchor="middle"
                            style={{ fontFamily:"'IBM Plex Mono'", fontSize:9, fontWeight:700, fill:payload.hexColor, opacity:.9 }}>
                        {payload.isBuy ? "▲" : payload.isSell ? "▼" : "●"}
                      </text>
                    </g>
                  );
                }}
                activeDot={{ r: 5, fill: "#818cf8", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
