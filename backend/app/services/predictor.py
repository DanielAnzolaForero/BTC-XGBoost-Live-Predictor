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
        """Descarga datos y ejecuta la predicción"""
        if not hasattr(self, 'model') or self.model is None:
            self.load_resources()
            
        # 1. Datos en vivo (Pedimos 1000 para que el timeframe de 15m cubra más de 168 horas)
        loader = BinanceDataLoader()
        df_raw = loader.fetch_multi_timeframe(limit=1000) # <--- Asegura 250h en velas de 15m
        
        if df_raw is None or df_raw.empty:
            raise Exception("Error: El cargador de datos no devolvió información.")

        # 2. Preprocesamiento
        prep = DataPreprocessor(sequence_length=30)
        df_proc = prep.add_indicators(df_raw)
        
        # --- PARCHE DE COLUMNAS FALTANTES ---
        missing_features = [f for f in self.features if f not in df_proc.columns]
        for feature in missing_features:
            df_proc[feature] = 0.0
            
        # 3. Preparar entrada (Aseguramos que NO esté vacío)
        # Filtramos solo las columnas que el modelo conoce
        df_input = df_proc[self.features].dropna() # Limpiamos cualquier fila con NaN
        
        if df_input.empty:
            raise Exception(f"Datos insuficientes tras calcular indicadores. Filas resultantes: {len(df_input)}")

        # Tomamos la última fila disponible
        X_latest = df_input.tail(1) 
        
        # .values evita el UserWarning de feature names
        X_scaled = self.scaler.transform(X_latest.values) 
        
        # 4. Inferencia
        dmatrix = xgb.DMatrix(X_scaled)
        prob = float(self.model.predict(dmatrix)[0])
        
        # 5. Lógica de decisión (Aseguramos que los thresholds existan)
        t_long = self.thresholds.get("long", 0.539)
        t_exit = self.thresholds.get("exit", 0.502)
        
        prediction = "HOLD"
        if prob > t_long: prediction = "BUY"
        elif prob < t_exit: prediction = "SELL"
        
        return {
            "symbol": self.symbol,
            "prediction": prediction,
            "probability": round(prob, 4),
            "current_price": float(df_raw["close"].iloc[-1]),
            "timestamp": pd.Timestamp.now().isoformat()
        }