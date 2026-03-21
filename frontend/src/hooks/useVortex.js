import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { SB_URL, SB_KEY, SB_TABLE, API_URL, REFRESH_INTERVAL, MAX_HISTORY } from "../lib/config";
import { parseAPIRow, parseSupabaseRow } from "../lib/parser";

const supabase = createClient(SB_URL, SB_KEY);

export function useVortex() {
  const [timeframe, setTimeframe] = useState("1h");
  const [histories, setHistories]  = useState({ "15m": [], "1h": [], "4h": [], "12h": [], "24h": [] });
  const [latest, setLatest]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [fetchCount, setFetchCount] = useState(0);

  // 1. Cargar historial de Supabase para un timeframe específico
  const loadSupabase = useCallback(async (tf) => {
    try {
      const { data, error: sbErr } = await supabase
        .from(SB_TABLE)
        .select("*")
        .eq("timeframe", tf)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY);

      if (sbErr) throw sbErr;
      
      const parsed = (data || []).map(parseSupabaseRow);
      setHistories(prev => ({ ...prev, [tf]: parsed }));
      
      if (parsed.length > 0 && tf === timeframe && !latest) {
        setLatest(parsed[0]);
      }
    } catch (err) {
      console.error(`Error Supabase [${tf}]:`, err);
    }
  }, [timeframe, latest]);

  // 2. Fetch en vivo (API devuelve el de 1h como resp principal, pero guarda todos en DB)
  const refresh = useCallback(async () => {
    // No ponemos loading=true aquí para evitar flashes
    setError(null);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const data = await res.json();
      
      const entry = parseAPIRow(data);
      setLatest(entry);
      setFetchCount(c => c + 1);

      // Despues de predecir, recargamos el historial del TF actual para ver la nueva fila
      await loadSupabase(timeframe);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadSupabase, timeframe]);

  // Efecto inicial
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadSupabase("1h");
      // Carga perezosa de los demás
      ["15m", "4h", "12h", "24h"].forEach(tf => loadSupabase(tf));
      setLoading(false);
    };
    init();

    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh, loadSupabase]);

  // Recargar si cambia el timeframe
  useEffect(() => {
    loadSupabase(timeframe);
  }, [timeframe, loadSupabase]);

  return {
    timeframe,
    setTimeframe,
    history: histories[timeframe] || [],
    latest,
    loading,
    error,
    fetchCount,
    refresh
  };
}
