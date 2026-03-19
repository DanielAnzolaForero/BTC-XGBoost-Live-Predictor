import logging
import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app.services.predictor import PredictorService
from backend.app.core.database import guardar_prediccion

log = logging.getLogger(__name__)
router = APIRouter()

# Path to model metadata for the model-info endpoint
_METADATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "models_files", "model_metadata.json"
)

# 1. Estructura de la respuesta
class PredictionResponse(BaseModel):
    symbol: str
    prediction: str
    probability: float
    current_price: float

# 2. Endpoint principal de predicción
@router.get("/predict/{symbol}", response_model=PredictionResponse)
def get_prediction(symbol: str):
    try:
        log.info("Prediction request received for %s", symbol.upper())

        # A. Instanciar servicio y calcular predicción
        predictor = PredictorService(symbol=symbol.upper())
        result = predictor.predict_next()

        # B. Guardar en Supabase (fire-and-forget, no bloqueamos al usuario)
        log.info("Prediction generated: %s — saving to Supabase", result)
        db_response = guardar_prediccion(result)

        if db_response:
            log.info("Supabase INSERT successful")
        else:
            log.warning("Prediction done, but Supabase INSERT returned no response")

        # C. Retornar JSON al frontend
        return result

    except Exception as e:
        log.exception("Critical error in /predict endpoint: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

# 3. Endpoint de historial (Últimas 24h para el gráfico)
@router.get("/history/{symbol}")
def get_history(symbol: str):
    from binance.spot import Spot as Client
    import pandas as pd
    try:
        client = Client(base_url='https://api1.binance.com')
        # Pedimos las ultimas 24 horas para dibujar en el dashboard
        klines = client.klines(symbol.upper(), "1h", limit=24)
        
        history = []
        for k in klines:
            dt = pd.to_datetime(k[0], unit='ms')
            history.append({
                "time": dt.strftime("%H:%M"),
                "price": float(k[4])
            })
        return {"symbol": symbol.upper(), "history": history}
    except Exception as e:
        log.error("Failed to fetch history from Binance: %s", e)
        return {"symbol": symbol.upper(), "history": []}

# 4. Endpoint de información del modelo (para el portfolio)
@router.get("/model-info")
def get_model_info():
    """
    Returns model metadata, features, thresholds, and training metrics.
    Useful to expose transparency and confidence in the ML model.
    """
    try:
        meta_path = os.path.normpath(_METADATA_PATH)
        if not os.path.exists(meta_path):
            raise FileNotFoundError(f"model_metadata.json not found at {meta_path}")

        with open(meta_path, "r") as f:
            meta = json.load(f)

        return {
            "model": "XGBoost Gradient Boosting",
            "symbol": meta.get("symbol", "BTCUSDT"),
            "num_features": len(meta.get("features", [])),
            "timeframes": ["15m", "1h", "4h", "1d"],
            "labeling_method": "Triple Barrier",
            "thresholds": meta.get("thresholds", {}),
            "metrics_at_train": meta.get("metrics_at_train", {}),
            "features": meta.get("features", []),
        }
    except Exception as e:
        log.exception("Failed to load model metadata: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
