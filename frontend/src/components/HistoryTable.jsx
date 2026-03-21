import { motion, AnimatePresence } from "framer-motion";
import { fmtPrice, fmtConf, fmtTs, confColor } from "../lib/parser";

const TABS = ["15m", "1h", "4h", "12h", "24h"];

export default function HistoryTable({ history, timeframe, setTimeframe }) {
  return (
    <div className="vx-card overflow-hidden">
      {/* ── Header with Tabs ── */}
      <div className="px-5 py-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-indigo-500/40 rounded-full" />
          <span className="font-mono font-bold text-ink text-[11px] tracking-[2.5px] uppercase">
            Historial de señales
          </span>
        </div>

        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 bg-card2 border border-faint rounded-lg p-1 self-start sm:self-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-3 py-1.5 rounded-md font-mono text-[9px] font-bold tracking-widest transition-all ${
                timeframe === t
                  ? "bg-faint text-ink shadow-sm"
                  : "text-dim hover:text-sub"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table Content ── */}
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line bg-card2/30">
              {["Timestamp", "Señal", "Precio", "Conf.", "Cambio"].map((h, i) => (
                <th key={i} className="px-5 py-3 text-left font-mono text-dim text-[8px] tracking-[2px] uppercase font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            <AnimatePresence mode="popLayout">
              {history.length === 0 ? (
                <motion.tr
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <td colSpan="5" className="px-5 py-12 text-center font-mono text-dim text-[10px] tracking-widest uppercase">
                    SIN SEÑALES PARA ESTE TIMEFRAME
                  </td>
                </motion.tr>
              ) : (
                history.map((row, i) => (
                  <motion.tr
                    key={row.ts?.getTime() || i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    transition={{ delay: Math.min(i * 0.04, 0.4) }}
                    className="group hover:bg-card2/40"
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap font-mono text-sub text-[10px]">
                      {fmtTs(row.ts)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono font-bold text-[9px] tracking-widest shadow-sm"
                            style={{ color: row.hexColor, borderColor: `${row.hexColor}33`, background: `${row.hexColor}08` }}>
                        {row.arrow} {row.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-ink text-[11px] font-medium tracking-tight">
                      {fmtPrice(row.price)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1 bg-line rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${row.conf*100}%`, background: confColor(row.conf) }} />
                        </div>
                        <span className="font-mono text-[9px] font-bold" style={{ color: confColor(row.conf) }}>
                          {fmtConf(row.conf)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[10px] text-dim group-hover:text-sub italic">
                      —
                    </td>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}
