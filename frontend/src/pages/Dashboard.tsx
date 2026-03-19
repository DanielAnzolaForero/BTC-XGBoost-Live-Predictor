import { useState, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity,
  RefreshCw, Github, Zap, ShieldCheck, Sparkles, AlertCircle
} from 'lucide-react';
import { motion, type Variants } from 'framer-motion';


// No longer need mockHistory, we will fetch real data from our backend

// Animation variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
    },
  },
};

const cardHoverVariants: Variants = {
  rest: {
    scale: 1,
    boxShadow: "0 0 0 rgba(59, 130, 246, 0)",
  },
  hover: {
    scale: 1.02,
    boxShadow: "0 0 30px rgba(59, 130, 246, 0.3)",
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
};



const Dashboard = () => {
  const [prediction, setPrediction] = useState<{ direction: 'UP' | 'DOWN' | 'HOLD', prob: number } | null>({
    direction: 'UP',
    prob: 0.87
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{ time: string, price: number }[]>([]);

  // Load real 24h history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await fetch('/api/v1/history/BTCUSDT');
        if (res.ok) {
          const data = await res.json();
          if (data.history && data.history.length > 0) {
            setChartData(data.history);
          }
        }
      } catch (err) {
        console.error("Failed to fetch initial history:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    fetchHistory();
  }, []);

  // Simulate analysis
  const handleAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/v1/predict/BTCUSDT');
      if (!response.ok) {
        throw new Error('Error de red al contactar la API');
      }
      
      const data = await response.json();
      
      // Mapeamos la respuesta del backend (BUY, SELL, HOLD) al UI
      let dir: 'UP' | 'DOWN' | 'HOLD' = 'HOLD';
      if (data.prediction === 'BUY') dir = 'UP';
      if (data.prediction === 'SELL') dir = 'DOWN';
      
      setPrediction({
        direction: dir,
        prob: data.probability,
      });

      // Actualizamos el gráfico con el precio real
      const timeStr = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setChartData(prev => {
        const newData = [...prev.slice(1), { time: timeStr, price: data.current_price }];
        return newData;
      });

    } catch (error) {
      console.error("Error fetching prediction:", error);
      setFetchError("Backend unreachable. Make sure FastAPI is running on port 8000.");
      // Clear error after 5 seconds
      setTimeout(() => setFetchError(null), 5000);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-20 right-10 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl"
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Header */}
      <motion.nav
        className="relative z-10 flex justify-between items-center mb-10"
        variants={itemVariants}
      >
        <motion.div
          className="flex items-center gap-3"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-lg shadow-lg shadow-blue-500/20"
            animate={{
              boxShadow: [
                "0 0 20px rgba(59, 130, 246, 0.3)",
                "0 0 40px rgba(59, 130, 246, 0.6)",
                "0 0 20px rgba(59, 130, 246, 0.3)",
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Zap className="text-white w-6 h-6" />
          </motion.div>
          <motion.h1
            className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-blue-300 to-purple-400"
            animate={{
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            CryptoPredict Pro
          </motion.h1>
        </motion.div>

        <motion.div
          className="flex gap-4"
          variants={itemVariants}
        >
          <motion.button
            className="glass-card px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10 transition relative overflow-hidden group"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition"
              initial={false}
            />
            <Github className="w-4 h-4 relative z-10" />
            <span className="relative z-10">Portfolio</span>
          </motion.button>
        </motion.div>
      </motion.nav>

      {/* Main content */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart Card */}
        <motion.div
          variants={itemVariants}
          whileHover="hover"
          initial="rest"
          animate="rest"
          className="lg:col-span-2"
        >
          <motion.div
            className="glass-card p-6 backdrop-blur-xl border border-white/10 rounded-2xl h-full"
            variants={cardHoverVariants}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <motion.h2
                  className="text-xl font-semibold"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  BTC/USDT Analysis
                </motion.h2>
                <motion.p
                  className="text-gray-400 text-sm"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  Real-time market movement and AI forecasting
                </motion.p>
              </div>
              <div className="flex gap-2">
                <motion.span
                  className="bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-xs font-medium border border-green-500/20 flex items-center gap-2"
                  animate={{
                    boxShadow: [
                      "0 0 0px rgba(34, 197, 94, 0.3)",
                      "0 0 15px rgba(34, 197, 94, 0.6)",
                      "0 0 0px rgba(34, 197, 94, 0.3)",
                    ],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <motion.div
                    className="w-2 h-2 bg-green-500 rounded-full"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  LIVE DATA
                </motion.span>
              </div>
            </div>

            {/* Error Toast */}
            {fetchError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {fetchError}
              </motion.div>
            )}

            {/* Chart or Skeleton */}
            <motion.div
              className="h-[350px] w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              {isLoadingHistory ? (
                <div className="h-full flex flex-col justify-end gap-2 animate-pulse">
                  <div className="flex items-end gap-1 h-[280px]">
                    {[40, 55, 45, 70, 60, 80, 65, 75, 55, 85, 70, 90].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-blue-500/10 rounded-t-sm border-t border-blue-500/20"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <div className="h-4 bg-white/5 rounded w-full" />
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(24, 24, 27, 0.95)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                    }}
                    cursor={{ stroke: 'rgba(59, 130, 246, 0.3)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPrice)"
                    isAnimationActive={true}
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Prediction Panel */}
        <div className="space-y-6">
          {/* AI Prediction Card */}
          <motion.div
            variants={itemVariants}
            whileHover="hover"
            initial="rest"
            animate="rest"
          >
            <motion.div
              className="glass-card p-6 border-l-4 border-l-blue-500 backdrop-blur-xl h-full"
              variants={cardHoverVariants}
            >
              <div className="flex items-center gap-2 mb-4">
                <motion.div
                  animate={{
                    rotate: isAnalyzing ? 360 : 0,
                  }}
                  transition={{
                    duration: isAnalyzing ? 1 : 0,
                    repeat: isAnalyzing ? Infinity : 0,
                    ease: "linear",
                  }}
                >
                  <Activity className="text-blue-500 w-5 h-5" />
                </motion.div>
                <h3 className="font-medium">AI Prediction Model</h3>
              </div>

              <div className="text-center py-6">
                <motion.div
                  className={`text-5xl font-bold mb-2 flex items-center justify-center gap-2 ${
                    prediction?.direction === 'UP' ? 'text-green-500' : 
                    prediction?.direction === 'DOWN' ? 'text-red-500' : 'text-yellow-500'
                  }`}
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    repeatDelay: 2,
                    ease: "easeInOut",
                  }}
                >
                  {prediction?.direction === 'UP' ? (
                    <motion.div
                      animate={{ y: [-5, 5, -5] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      <TrendingUp className="w-10 h-10" />
                    </motion.div>
                  ) : prediction?.direction === 'DOWN' ? (
                    <motion.div
                      animate={{ y: [5, -5, 5] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      <TrendingDown className="w-10 h-10" />
                    </motion.div>
                  ) : (
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      <Activity className="w-10 h-10" />
                    </motion.div>
                  )}
                  {prediction?.direction}
                </motion.div>

                <p className="text-gray-400 text-sm">Confidence Level</p>
                <div className="mt-4 bg-gray-800/50 rounded-full h-2 w-full overflow-hidden border border-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(prediction?.prob || 0) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full shadow-lg shadow-blue-500/50"
                  />
                </div>
                <motion.p
                  className="text-sm mt-1 font-mono text-blue-400"
                  key={prediction?.prob}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {((prediction?.prob || 0) * 100).toFixed(1)}%
                </motion.p>
              </div>

              <motion.button
                onClick={handleAnalysis}
                disabled={isAnalyzing}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition flex items-center justify-center gap-2 relative overflow-hidden group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/10 to-blue-400/0 opacity-0 group-hover:opacity-100"
                  animate={{
                    x: ["-100%", "100%"],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <motion.div
                  animate={{ rotate: isAnalyzing ? 360 : 0 }}
                  transition={{
                    duration: isAnalyzing ? 1 : 0,
                    repeat: isAnalyzing ? Infinity : 0,
                    ease: "linear",
                  }}
                >
                  <RefreshCw className="w-4 h-4 relative z-10" />
                </motion.div>
                <span className="relative z-10">{isAnalyzing ? 'Analyzing...' : 'Run New Analysis'}</span>
              </motion.button>
            </motion.div>
          </motion.div>

          {/* Model Metrics Card */}
          <motion.div
            variants={itemVariants}
            whileHover="hover"
            initial="rest"
            animate="rest"
          >
            <motion.div
              className="glass-card p-6 backdrop-blur-xl border border-white/10 rounded-2xl"
              variants={cardHoverVariants}
            >
              <div className="flex items-center gap-2 mb-4">
                <motion.div
                  animate={{
                    rotate: [0, 360],
                  }}
                  transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  <ShieldCheck className="text-purple-500 w-5 h-5" />
                </motion.div>
                <h3 className="font-medium">Model Metrics</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <motion.div
                  className="text-center p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-lg border border-blue-500/20 hover:border-blue-500/40 transition"
                  whileHover={{ scale: 1.05, backgroundColor: "rgba(59, 130, 246, 0.15)" }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-xs text-gray-400 mb-1">Accuracy</p>
                  <motion.p
                    className="text-lg font-bold text-blue-400"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    78.4%
                  </motion.p>
                </motion.div>

                <motion.div
                  className="text-center p-3 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition"
                  whileHover={{ scale: 1.05, backgroundColor: "rgba(168, 85, 247, 0.15)" }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-xs text-gray-400 mb-1">LSTM Layers</p>
                  <motion.p
                    className="text-lg font-bold text-purple-400"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7 }}
                  >
                    2
                  </motion.p>
                </motion.div>
              </div>

              {/* Additional metrics with animation */}
              <motion.div
                className="mt-4 pt-4 border-t border-white/5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <Sparkles className="w-3 h-3 text-yellow-400" />
                  </motion.div>
                  Model updated 2 minutes ago
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default Dashboard;
