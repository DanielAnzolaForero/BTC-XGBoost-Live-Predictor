import os
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Cargar variables del archivo .env (local) 
# En Render, esto no afectará porque las variables ya están en el sistema
load_dotenv()

# 2. Obtener credenciales desde el entorno
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")

# 3. Validación de seguridad (Buena práctica de ingeniería)
if not url or not key:
    raise ValueError("Error: SUPABASE_URL o SUPABASE_KEY no configuradas en el entorno.")

# 4. Inicializar el cliente único
supabase: Client = create_client(url, key)

def guardar_prediccion(data_dict: dict):
    """
    Envía la inferencia de XGBoost a la base de datos en Supabase.
    Asegura que los nombres coincidan con la tabla SQL.
    """
    try:
        # Usamos .get() para evitar errores si falta una llave en el diccionario
        # y mapeamos al nombre de columna que definimos en SQL
        data_final = {
            "symbol": data_dict.get("symbol"),
            "prediction": data_dict.get("prediction"),
            "probability": float(data_dict.get("probability", 0)),
            "price_at_prediction": float(data_dict.get("price_at_prediction") or data_dict.get("current_price") or 0)
        }
        
        print(f"DEBUG - Intentando insertar: {data_final}")
        
        response = supabase.table("btc_predictions").insert(data_final).execute()
        return response
    except Exception as e:
        print(f"❌ Error crítico de base de datos: {e}")
        return None