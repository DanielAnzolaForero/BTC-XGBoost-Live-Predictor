import os
import logging
import pandas as pd
import numpy as np
from binance.spot import Spot as Client
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BinanceDataLoader:
    def __init__(self, data_dir=None):
        # CAMBIO CLAVE: Usamos api1 o api3 que son más estables en la nube
        self.client = Client(base_url='https://api1.binance.com')
        self.data_dir = data_dir
        
        self.intervals = {
            "1h": "1h",
            "4h": "4h",
            "15m": "15m",
            "1d": "1d"
        }

    def fetch_multi_timeframe(self, symbol="BTCUSDT", limit=1000) -> pd.DataFrame:
        logger.info(f"Descargando datos combinados (CSV + Binance API) para {symbol}...")
        
        try:
            dfs = {}
            for tf_name, tf_binance in self.intervals.items():
                
                df_csv = None
                if self.data_dir:
                    csv_path = os.path.join(self.data_dir, f"btc_{tf_name}_data_2018_to_2025.csv")
                    if os.path.exists(csv_path):
                        logger.info(f"  [{tf_name}] Cargando historial en CSV...")
                        # Error_bad_lines se usa implicito si dropeamos
                        df_csv = pd.read_csv(csv_path)
                        df_csv.columns = df_csv.columns.str.strip()
                        df_csv = df_csv.rename(columns={
                            "Open time": "open_time",
                            "Open": "open",
                            "High": "high",
                            "Low": "low",
                            "Close": "close",
                            "Volume": "volume",
                            "Close time": "close_time",
                            "Quote asset volume": "quote_vol",
                            "Number of trades": "num_trades",
                            "Taker buy base asset volume": "taker_buy_vol",
                            "Taker buy quote asset volume": "taker_buy_quote_vol",
                            "Ignore": "ignore"
                        })
                        df_csv["open_time"] = pd.to_datetime(df_csv["open_time"], errors='coerce').dt.tz_localize(None)
                        df_csv = df_csv.dropna(subset=["open_time"])
                
                # Un pequeño respiro para evitar bloqueos por velocidad
                time.sleep(0.5) 
                
                # Binance max limit is 1000. Pedimos 1000 para enlazar con CSV
                actual_limit = 1000 if df_csv is not None else min(1000, limit)
                klines = self.client.klines(symbol, tf_binance, limit=actual_limit)
                
                # Validación de seguridad: si klines no trae nada, lanzamos error
                if not klines:
                    raise ValueError(f"No se recibieron datos para el timeframe {tf_name}")

                df_api = pd.DataFrame(klines, columns=[
                    "open_time", "open", "high", "low", "close", "volume",
                    "close_time", "quote_vol", "num_trades",
                    "taker_buy_vol", "taker_buy_quote_vol", "ignore"
                ])
                
                df_api["open_time"] = pd.to_datetime(df_api["open_time"], unit='ms', errors='coerce').dt.tz_localize(None)
                df_api = df_api.dropna(subset=["open_time"])
                
                numeric_cols = ["open", "high", "low", "close", "volume", "quote_vol", "num_trades", "taker_buy_vol", "taker_buy_quote_vol"]
                df_api[numeric_cols] = df_api[numeric_cols].apply(pd.to_numeric)
                
                if df_csv is not None:
                    # Combinamos CSV y API, eliminando duplicados mediante 'open_time'
                    df_csv[numeric_cols] = df_csv[numeric_cols].apply(pd.to_numeric)
                    df = pd.concat([df_csv, df_api], ignore_index=True)
                    df = df.drop_duplicates(subset=["open_time"], keep="last")
                    df = df.sort_values("open_time").reset_index(drop=True)
                else:
                    df = df_api
                
                logger.info(f"  [{tf_name}] Total velas: {len(df)}")
                
                prefix = ""
                if tf_name == "4h": prefix = "s_"
                elif tf_name == "15m": prefix = "m_"
                elif tf_name == "1d": prefix = "d_"
                
                if prefix:
                    df = df.rename(columns={c: f"{prefix}{c}" for c in numeric_cols})
                
                dfs[tf_name] = df
                
            df_final = dfs["1h"].copy()
            
            for tf in ["4h", "15m", "1d"]:
                df_final = pd.merge_asof(
                    df_final.sort_values("open_time"),
                    dfs[tf].sort_values("open_time"),
                    on="open_time",
                    direction="backward",
                    suffixes=("", f"_{tf}")
                )
            
            logger.info("✅ Datos descargados, combinados y alineados correctamente.")
            return df_final

        except Exception as e:
            # Ahora el log te dirá exactamente QUÉ falló en Render
            logger.error(f"❌ Error detallado en Binance DataLoader: {str(e)}")
            return None