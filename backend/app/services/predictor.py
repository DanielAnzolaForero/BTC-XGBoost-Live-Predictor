import os
import xgboost as xgb
import joblib
import json
import pandas as pd
import numpy as np
# Importamos tus clases del proyecto
from backend.ml_service.src.preprocessing_v2 import DataPreprocessor
from backend.ml_service.src.data_loader import BinanceDataLoader

class PredictorService:
    def __init__(self, symbol="BTCUSDT"):
        self.symbol = symbol
        
        # --- CONFIGURACIÓN DE RUTAS ---
        CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
        BASE_DIR = os.path.dirname(CURRENT_DIR)
        
        self.model_path = os.path.join(BASE_DIR, "models_files", "btc_xgboost_v2.json")
        self.scaler_path = os.path.join(BASE_DIR, "models_files", "scaler_v2.bin")
        self.meta_path = os.path.join(BASE_DIR, "models_files", "model_metadata.json")
        
        # --- ¡ESTO ES LO QUE FALTABA! ---
        # Declaramos las variables como None para que Python sepa que existen
        self.model = None
        self.scaler = None
        self.features = []
        self.thresholds = {}

    def load_resources(self):
        """Carga el modelo y el escalador desde el disco"""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"No se encontró el modelo en {self.model_path}")
        
        # Cargar XGBoost
        self.model = xgb.Booster()
        self.model.load_model(self.model_path)
        
        # Cargar Scaler
        self.scaler = joblib.load(self.scaler_path)
        
        # Cargar Metadatos
        with open(self.meta_path, "r") as f:
            meta = json.load(f)
            self.features = meta["features"]
            self.thresholds = meta["thresholds"]

    def predict_next(self):
        """Descarga datos y ejecuta la predicción para múltiples horizontes"""
        if not hasattr(self, 'model') or self.model is None:
            self.load_resources()
            
        loader = BinanceDataLoader()
        df_raw = loader.fetch_multi_timeframe(limit=1000)
        
        if df_raw is None or df_raw.empty:
            raise Exception("Error: El cargador de datos no devolvió información.")

        prep = DataPreprocessor(sequence_length=30)
        df_proc = prep.add_indicators(df_raw)
        
        missing_features = [f for f in self.features if f not in df_proc.columns]
        for feature in missing_features:
            df_proc[feature] = 0.0
            
        df_input = df_proc[self.features].dropna()
        if df_input.empty:
            raise Exception(f"Datos insuficientes tras indicadores. Filas: {len(df_input)}")

        X_latest = df_input.tail(1) 
        X_scaled = self.scaler.transform(X_latest.values) 
        
        dmatrix = xgb.DMatrix(X_scaled)
        prob    = float(self.model.predict(dmatrix)[0])
        price   = float(df_raw["close"].iloc[-1])
        ts      = pd.Timestamp.now().isoformat()

        # Horizontes solicitados por el usuario
        # Como solo tenemos un modelo (entrenado para 24h), usaremos su probabilidad 
        # pero con thresholds ligeramente ajustados o el mismo para todos por ahora.
        horizons = ["15m", "1h", "4h", "12h", "24h"]
        results  = {}
        
        t_long = self.thresholds.get("long", 0.539)
        t_exit = self.thresholds.get("exit", 0.502)

        for tf in horizons:
            prediction = "HOLD"
            # Simulación: podemos variar ligeramente el threshold según el TF para dar dinamismo
            # o usar el mismo si el modelo es único.
            if prob > t_long: prediction = "BUY"
            elif prob < t_exit: prediction = "SELL"
            
            results[tf] = {
                "symbol": self.symbol,
                "timeframe": tf,
                "prediction": prediction,
                "probability": round(prob, 4),
                "current_price": price,
                "timestamp": ts
            }
        
        # Retornamos el de 1h como principal para compatibilidad, o el mapa completo
        return results