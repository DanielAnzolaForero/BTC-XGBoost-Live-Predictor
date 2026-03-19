# CryptoPredict Pro 🚀

> **Real-time Bitcoin price direction prediction using a multi-timeframe XGBoost model, served via FastAPI and visualised in a React dashboard.**

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://reactjs.org)
[![XGBoost](https://img.shields.io/badge/XGBoost-2.x-orange)](https://xgboost.readthedocs.io)
[![Render](https://img.shields.io/badge/deployed%20on-Render-46E3B7?logo=render)](https://render.com)

---

## 🧠 What this project does

CryptoPredict Pro trains an **XGBoost Gradient Boosting** classifier on 7 years of BTC/USDT price data (2018–2025), with engineered features across four timeframes: **15m**, **1h**, **4h**, **1d**.

At runtime it:
1. Downloads the latest 1,000 candles per timeframe live from **Binance API**.
2. Runs the same feature engineering pipeline used during training.
3. Produces a directional signal: **BUY / SELL / HOLD** and a confidence probability.
4. Persists every prediction to **Supabase** for historical analysis.
5. Serves everything via a **FastAPI REST API** consumed by a **React + Tailwind** dashboard.

---

## 📐 Architecture

```
┌─────────────────────────────────────────────┐
│              React + Vite Frontend           │
│   Framer Motion · Recharts · Lucide Icons   │
└──────────────┬──────────────────────────────┘
               │  Fetch /api/v1/predict & /history
┌──────────────▼──────────────────────────────┐
│             FastAPI (Python 3.12)            │
│   /predict  ·  /history  ·  /model-info     │
└──────┬──────────────────────┬───────────────┘
       │                      │
┌──────▼──────┐       ┌───────▼───────┐
│  ML Service  │       │   Supabase    │
│  XGBoost     │       │  (PostgreSQL) │
│  + Scaler    │       │  predictions  │
└──────┬──────┘       └───────────────┘
       │
┌──────▼──────┐
│  Binance   │
│  REST API  │
│  4 TFs live│
└────────────┘
```

---

## 🔬 Machine Learning Pipeline

### Feature Engineering (52 features across 4 timeframes)

| Category | Features |
|---|---|
| **Candle structure (1h)** | `body_ratio`, `upper_wick`, `lower_wick`, `body_size`, `is_bullish` |
| **Momentum (1h)** | `ret_1h`, `ret_4h`, `ret_12h`, `ret_24h`, `ret_48h`, `ret_168h`, `mom_accel_*` |
| **Volume (1h)** | `rel_vol_24`, `vol_price_corr`, `vwap_dist`, `taker_ratio_1h` |
| **Volatility** | `atr_rel`, `atr_change`, `vol_regime` |
| **4h context** | `body_4h`, `ret_1c_4h`, `divergence_1v4`, `taker_div_4h` |
| **15m micro** | `body_15m`, `ret_1c_15m`, `mom_accel_15m`, `taker_15m` |
| **1d macro** | `ret_1d`, `ret_7d`, `d_pos`, `above_d_close` |
| **Open Interest** | `oi_rel`, `oi_chg_1h`, `oi_chg_8h` |
| **Long/Short ratio** | `ls_ratio_feat`, `ls_vs_sma` |
| **Cyclical time** | `hour_sin`, `hour_cos`, `dow_sin`, `dow_cos` |

### Labeling Method
**Triple Barrier** with ATR-scaled Take-Profit / Stop-Loss and a neutral (timeout) class — a method popularised by Marcos López de Prado in *Advances in Financial Machine Learning*.

### Training Metrics
| Metric | Value |
|---|---|
| Accuracy | 52.80% |
| Precision | 46.95% |
| Threshold (Long) | > 0.539 |
| Threshold (Exit) | < 0.502 |

> **Note:** Beating 50% consistently on directional prediction for BTC is non-trivial. The model has built-in hysteresis (asymmetric thresholds) to reduce excessive trading and commission cost.

---

## 🚀 Running Locally

### Prerequisites
- Python 3.12
- Node.js 20+
- A Binance account (public API, no keys needed for read-only)
- A Supabase project (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/your-username/crypto-pro.git
cd crypto-pro
```

### 2. Backend

```bash
pip install -r requirements.txt
cp .env.example .env    # add your SUPABASE_URL and SUPABASE_KEY
python -m uvicorn backend.app.main:app --reload
```

API will be at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard at `http://localhost:5173`.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/predict/{symbol}` | Run model inference on live data |
| `GET` | `/api/v1/history/{symbol}` | Last 24h of hourly closing prices |
| `GET` | `/api/v1/model-info` | Model metadata, features and training metrics |
| `GET` | `/health` | Health check |

---

## 🛠 Tech Stack

**Backend:** Python 3.12, FastAPI, XGBoost, pandas, pandas-ta, python-binance, Supabase (PostgreSQL), joblib

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS v3, Framer Motion, Recharts, Lucide React

**Deployment:** Render (Web Service), Supabase (managed DB)

---

## 📂 Project Structure

```
crypto-pro/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints.py   # FastAPI routes
│   │   ├── core/database.py      # Supabase client
│   │   ├── models_files/         # Trained model + scaler + metadata
│   │   └── services/predictor.py # Orchestrates inference
│   └── ml_service/src/
│       ├── data_loader.py        # Binance multi-timeframe downloader
│       ├── preprocessing_v2.py   # Feature engineering (52 features)
│       └── final_model.py        # Training pipeline
└── frontend/
    └── src/
        ├── pages/Dashboard.tsx   # Main UI component
        └── index.css             # Tailwind + custom design system
```

---

## 📝 Disclaimer

This project is for **educational and portfolio purposes only**. Do not use it to make real trading decisions. Past model performance does not guarantee future results.
