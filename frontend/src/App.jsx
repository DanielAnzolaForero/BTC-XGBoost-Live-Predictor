import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useVortex } from "./hooks/useVortex";
import Header from "./components/Header";
import HeroCard from "./components/HeroCard";
import PriceChart from "./components/PriceChart";
import HistoryTable from "./components/HistoryTable";
import ErrorBanner from "./components/ErrorBanner";

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

export default function App() {
  const { history, latest, loading, error, fetchCount, refresh, timeframe, setTimeframe } = useVortex();
  const [dismissedError, setDismissedError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("—");

  useEffect(() => {
    const tick = () => setLastUpdated(new Date().toLocaleTimeString("es-CO", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const shownError = error !== dismissedError ? error : null;

  return (
    <div className="min-h-screen bg-bg">
      <Header loading={loading} lastUpdated={lastUpdated} onRefresh={refresh}/>

      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-4xl mx-auto px-5 py-6 flex flex-col gap-4"
      >
        <motion.div variants={itemVariants}>
          <ErrorBanner error={shownError} onDismiss={() => setDismissedError(error)}/>
        </motion.div>

        <motion.div variants={itemVariants}>
          <HeroCard latest={latest} history={history} loading={loading}/>
        </motion.div>

        <motion.div variants={itemVariants}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PriceChart history={history} />
            <HistoryTable
              history={history}
              timeframe={timeframe}
              setTimeframe={setTimeframe}
            />
          </div>
        </motion.div>
      </motion.main>

      <footer className="max-w-4xl mx-auto px-5 pb-8">
        <div className="border-t border-line pt-4 flex flex-wrap justify-between gap-2">
          <p className="font-mono text-[7px] text-faint tracking-widest">© 2025 VORTEX TRADING INTELLIGENCE · XGBOOST ML CORE</p>
          <p className="font-mono text-[7px] text-faint tracking-wide">SOLO FINES INFORMATIVOS — NO ASESORAMIENTO FINANCIERO</p>
        </div>
      </footer>
    </div>
  );
}
