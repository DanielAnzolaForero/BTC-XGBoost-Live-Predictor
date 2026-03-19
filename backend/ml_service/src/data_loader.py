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
        
        self.intervals = {
            "1h": "1h",
            "4h": "4h",
            "15m": "15m",
            "1d": "1d"
        }

    def fetch_multi_timeframe(self, symbol="BTCUSDT", limit=1000) -> pd.DataFrame:
        logger.info(f"Descargando datos en vivo de Binance para {symbol}...")
        
        try:
            dfs = {}
            for tf_name, tf_binance in self.intervals.items():
                # Un pequeño respiro para evitar bloqueos por velocidad
                time.sleep(0.5) 
                
                # Binance max limit is 1000. Si pedimos más, fallará.
                actual_limit = min(1000, limit)
                klines = self.client.klines(symbol, tf_binance, limit=actual_limit)
                
                # Validación de seguridad: si klines no trae nada, lanzamos error
                if not klines:
                    raise ValueError(f"No se recibieron datos para el timeframe {tf_name}")

                df = pd.DataFrame(klines, columns=[
                    "open_time", "open", "high", "low", "close", "volume",
                    "close_time", "quote_vol", "num_trades",
                    "taker_buy_vol", "taker_buy_quote_vol", "ignore"
                ])
                
                df["open_time"] = pd.to_datetime(df["open_time"], unit='ms')
                numeric_cols = ["open", "high", "low", "close", "volume", "quote_vol", "num_trades", "taker_buy_vol", "taker_buy_quote_vol"]
                df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric)
                
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
            
            logger.info("✅ Datos descargados y alineados correctamente.")
            return df_final

        except Exception as e:
            # Ahora el log te dirá exactamente QUÉ falló en Render
            logger.error(f"❌ Error detallado en Binance: {str(e)}")
            return None