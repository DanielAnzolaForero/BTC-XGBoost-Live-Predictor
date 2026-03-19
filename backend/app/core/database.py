import os
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
log = logging.getLogger(__name__)

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError("Error: SUPABASE_URL or SUPABASE_KEY not set in environment.")

supabase: Client = create_client(url, key)

def guardar_prediccion(data_dict: dict):
    """
    Persists an XGBoost inference result to Supabase.
    Column names must match the SQL table definition.
    """
    try:
        data_final = {
            "symbol":             data_dict.get("symbol"),
            "prediction":         data_dict.get("prediction"),
            "probability":        float(data_dict.get("probability", 0)),
            "price_at_prediction": float(
                data_dict.get("price_at_prediction") or data_dict.get("current_price") or 0
            )
        }
        log.debug("Inserting prediction into Supabase: %s", data_final)
        response = supabase.table("btc_predictions").insert(data_final).execute()
        return response
    except Exception as e:
        log.error("Supabase INSERT failed: %s", e)
        return None