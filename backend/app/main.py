import sys
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.v1 import endpoints

# Configuración de rutas para módulos
# Resolve() asegura que la ruta sea absoluta y no falle en Linux/Render
root_path = Path(__file__).resolve().parent.parent
sys.path.append(str(root_path))

app = FastAPI(title="Crypto Prediction API")

# --- PASO A: Localizar el Frontend (Relativo a la raíz del proyecto) ---
# Si main.py está en /backend, .parent.parent nos lleva a la raíz
frontend_path = root_path / "frontend" / "dist"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PASO B: Rutas de la API (DEBEN IR PRIMERO) ---
app.include_router(endpoints.router, prefix="/api/v1", tags=["Predictions"])

# --- PASO C: Servir React (DEBE IR AL FINAL) ---
if frontend_path.exists():
    # Montamos los assets
    app.mount("/assets", StaticFiles(directory=str(frontend_path / "assets")), name="assets")
    
    # Esta ruta captura la entrada al sitio
    @app.get("/")
    async def serve_index():
        return FileResponse(str(frontend_path / "index.html"))

# Ruta de respaldo si el front no existe
@app.get("/health")
async def health():
    return {"status": "running", "frontend_detected": frontend_path.exists()}