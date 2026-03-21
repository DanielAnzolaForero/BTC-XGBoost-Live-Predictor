"""
research_pipeline_v2.py
------------------------
Pipeline XGBoost — limpio, sin deep learning.

Cambios respecto a versión anterior:
  - GRU/LSTM/Transformer eliminados
  - Usa todas las velas disponibles (limit=71758)
  - Bug 3 corregido en preprocessing
  - Umbral de histéresis 0.62 para reducir trades y comisiones
  - Diagnóstico completo con top features y calibración
"""

import os, sys, warnings
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score
import xgboost as xgb
from tabulate import tabulate
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

warnings.filterwarnings("ignore")
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_loader import BinanceDataLoader
from preprocessing_v2 import DataPreprocessor

try:
    from binance_extras import BinanceExtras
    _HAS_EXTRAS = True
except ImportError:
    _HAS_EXTRAS = False

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
SYMBOL   = "BTCUSDT"
SEQ_LEN  = 30


# ════════════════════════════════════════════════════════════════════════════
# MÉTRICAS
# ════════════════════════════════════════════════════════════════════════════
def calculate_financial_metrics(y_true, y_pred, prices, fee=0.0006):
    y_pred_s    = np.roll(y_pred, 1); y_pred_s[0] = 0
    prices_safe = np.where(prices[:-1] == 0, 1e-8, prices[:-1])
    hourly_ret  = np.diff(prices) / prices_safe
    positions   = y_pred_s[:-1]
    strat_ret   = positions * hourly_ret
    changes     = np.abs(np.diff(np.insert(positions, 0, 0)))
    strat_ret  -= changes * fee

    cum      = np.cumprod(1 + strat_ret)
    total    = (cum[-1] - 1) * 100 if len(cum) > 0 else 0.0
    std      = np.std(strat_ret)
    sharpe   = np.mean(strat_ret) / std * np.sqrt(24*365) if std > 1e-6 else 0.0
    roll_max = np.maximum.accumulate(cum)
    max_dd   = float(np.max((roll_max - cum) / roll_max)) if len(cum) > 0 else 0.0
    n_trades = int(np.sum(np.abs(np.diff(positions))) / 2)
    acc      = accuracy_score((y_true > 0).astype(int), y_pred)
    prec     = precision_score((y_true > 0).astype(int), y_pred, zero_division=0)

    return dict(total_ret=total, sharpe=sharpe, max_dd=max_dd,
                accuracy=acc, precision=prec, n_trades=n_trades)


# ════════════════════════════════════════════════════════════════════════════
# HISTÉRESIS
# ════════════════════════════════════════════════════════════════════════════
def apply_hysteresis(probs, umbral_long=0.539, umbral_exit=0.502):
    """
    Entrada : prob > 0.539 → zona de 56.7% accuracy
    Salida  : prob < 0.502 → banda más ancha para evitar oscilación
    """
    positions = np.zeros(len(probs), dtype=int)
    in_pos    = False
    for i, p in enumerate(probs):
        if not in_pos and p > umbral_long:
            in_pos = True
        elif in_pos and p < umbral_exit:
            in_pos = False
        positions[i] = int(in_pos)
    return positions


# ════════════════════════════════════════════════════════════════════════════
# DIAGNÓSTICO
# ════════════════════════════════════════════════════════════════════════════
def signal_diagnostics(prob_test, pred_test, y_test, features, importances):
    print(f"\n{'─'*55}")
    print(f"  DIAGNÓSTICO: XGBoost")
    print(f"{'─'*55}")

    # Top features
    feat_s = pd.Series(importances, index=features).sort_values(ascending=False)
    print("\n  Top 10 features:")
    for fname, fval in feat_s.head(10).items():
        bar = "█" * int(fval * 300)
        print(f"    {fname:<30} {fval:.4f}  {bar}")

    # Calibración
    df_cal           = pd.DataFrame({"prob": prob_test,
                                      "y": (y_test > 0).astype(int)})
    df_cal["bucket"] = pd.cut(df_cal["prob"], bins=10)
    cal              = df_cal.groupby("bucket", observed=True).agg(
        tasa_acierto=("y", "mean"), n_muestras=("y", "count")
    )
    print("\n  Calibración (prob predicha → tasa real de acierto):")
    print(f"  {'Bucket':<25} {'Tasa acierto':>13} {'Muestras':>10}")
    print(f"  {'─'*50}")
    for bucket, row in cal.iterrows():
        bar = "▓" * int(row["tasa_acierto"] * 20)
        print(f"  {str(bucket):<25} {row['tasa_acierto']:>12.1%} "
              f"{int(row['n_muestras']):>10}  {bar}")

    # Veredicto calibración
    high_mask = df_cal["prob"] > 0.65
    if high_mask.sum() > 10:
        acc     = df_cal.loc[high_mask, "y"].mean()
        verdict = "✓ Señal real" if acc > 0.58 else "✗ Sin señal en zona alta"
    else:
        verdict = "? Pocas muestras con prob > 0.65"
    print(f"\n  Veredicto: {verdict}")

    # Actividad
    n_total   = len(pred_test)
    n_changes = int(np.sum(np.abs(np.diff(pred_test))))
    n_long    = int(pred_test.sum())
    print(f"\n  Actividad:")
    print(f"    En posición : {n_long:5d} ({n_long/n_total*100:.1f}%)")
    print(f"    Cambios     : {n_changes:5d} ({n_changes/n_total*100:.1f}%)")
    tag = ("⚠  Over-trading" if n_changes/n_total > 0.30
           else "~  Moderado" if n_changes/n_total > 0.10
           else "✓  Eficiente")
    print(f"    {tag}")

    # Distribución de probabilidades
    print(f"\n  Distribución de probabilidades:")
    for q in [0.530, 0.535, 0.539, 0.545, 0.550, 0.558, 0.565]:
        n = (prob_test > q).sum()
        print(f"    prob > {q:.3f} : {n:5d} ({n/len(prob_test)*100:.1f}%)")

    # Gráfico
    fig, ax = plt.subplots(figsize=(7, 4))
    mids    = [iv.mid for iv in cal.index]
    ax.bar(mids, cal["tasa_acierto"], width=0.08, color="#4e91d4", alpha=0.8)
    ax.axhline(0.5, color="gray", linestyle="--", linewidth=1)
    ax.set_xlabel("Probabilidad predicha")
    ax.set_ylabel("Tasa de acierto real")
    ax.set_title("Calibración — XGBoost")
    ax.set_ylim(0, 1)
    fig.savefig("calibracion_xgboost.png", dpi=100, bbox_inches="tight")
    plt.close(fig)
    print(f"\n  Gráfico guardado: calibracion_xgboost.png")


# ════════════════════════════════════════════════════════════════════════════
# PIPELINE PRINCIPAL
# ════════════════════════════════════════════════════════════════════════════
def run_experiment():
    print("═" * 60)
    print("  XGBoost PIPELINE — 4 timeframes, todas las velas")
    print("═" * 60)

    # ── Carga — usar TODAS las velas disponibles ──────────────────────────
    loader = BinanceDataLoader(data_dir=DATA_DIR)
    df_raw = loader.fetch_multi_timeframe(limit=71758)
    if df_raw is None or df_raw.empty:
        print("Error cargando datos."); return

    print(f"  Velas cargadas: {len(df_raw):,}")

    # Shifts anti-leakage
    for pre, sft in [("s_", 4), ("m_", 4), ("d_", 24)]:
        cols = [c for c in df_raw.columns if c.startswith(pre)]
        if cols:
            df_raw[cols] = df_raw[cols].shift(sft)
    df_raw = df_raw.dropna().reset_index(drop=True)

    # Funding rate opcional
    if _HAS_EXTRAS:
        try:
            extras = BinanceExtras()
            df_raw = extras.enrich(df_raw, symbol=SYMBOL)
            cols_added = [c for c in ("funding_rate",) if c in df_raw.columns]
            if cols_added:
                print(f"  Extras cargados: {cols_added}")
        except Exception as e:
            print(f"  Funding rate no disponible ({e})")

    # ── Preprocesamiento ──────────────────────────────────────────────────
    prep    = DataPreprocessor(sequence_length=SEQ_LEN)
    df_proc = prep.add_indicators(df_raw)

    print("\nDistribución de labels:")
    DataPreprocessor.label_report(df_proc)

    prices      = df_raw.loc[df_proc.index, "close"].values
    y_macro     = df_proc["target_macro"].values
    valid_macro = df_proc["valid_macro"].values

    features = [c for c in df_proc.columns
                if c not in ("target_macro", "target_micro",
                             "valid_macro",  "valid_micro",
                             "open_time",    "close_time")]
    X = df_proc[features].values
    print(f"\nFeatures totales : {len(features)}")
    print(f"Velas procesadas : {len(X):,}")

    # ── Splits cronológicos 80/10/10 ──────────────────────────────────────
    n       = len(X)
    tr_end  = int(n * 0.80)
    val_end = int(n * 0.90)

    X_train, X_val, X_test = X[:tr_end], X[tr_end:val_end], X[val_end:]
    y_tr,    y_val, y_te   = y_macro[:tr_end], y_macro[tr_end:val_end], y_macro[val_end:]
    vm_tr,   vm_val        = valid_macro[:tr_end], valid_macro[tr_end:val_end]
    p_val,   p_test        = prices[tr_end:val_end], prices[val_end:]

    scaler = StandardScaler()
    X_tr_s = scaler.fit_transform(X_train)
    X_va_s = scaler.transform(X_val)
    X_te_s = scaler.transform(X_test)

    print(f"Split → Train: {tr_end:,} | Val: {val_end-tr_end:,} | Test: {n-val_end:,}")

    # ── XGBoost ───────────────────────────────────────────────────────────
    print("\nEntrenando XGBoost...")

    X_tr_xgb = X_tr_s[vm_tr];  y_tr_xgb = y_tr[vm_tr]
    X_va_xgb = X_va_s[vm_val]; y_va_xgb = y_val[vm_val]

    n_neg = (y_tr_xgb == 0).sum()
    n_pos = max((y_tr_xgb == 1).sum(), 1)
    spw   = n_neg / n_pos
    print(f"  scale_pos_weight = {spw:.3f}  (neg={n_neg:,}, pos={n_pos:,})")

    model = xgb.XGBClassifier(
        n_estimators=500,
        learning_rate=0.02,
        max_depth=5,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=1,
        scale_pos_weight=spw,
        eval_metric="logloss",
        early_stopping_rounds=50,
    )
    model.fit(X_tr_xgb, y_tr_xgb,
              eval_set=[(X_va_xgb, y_va_xgb)],
              verbose=False)
    print(f"  Mejor iteración : {model.best_iteration}")

    prob_test = model.predict_proba(X_te_s)[:, 1]
    pred_test = apply_hysteresis(prob_test)
    res       = calculate_financial_metrics(y_te, pred_test, p_test)

    # ── Diagnóstico ───────────────────────────────────────────────────────
    signal_diagnostics(prob_test, pred_test, y_te,
                       features, model.feature_importances_)

    # ── Reporte final ─────────────────────────────────────────────────────
    print("\n" + "═"*60)
    print(tabulate([[
        "XGBoost",
        f"{res['total_ret']:+.2f}%",
        f"{res['sharpe']:+.4f}",
        f"{res['max_dd']:.4f}",
        f"{res['accuracy']*100:.1f}%",
        f"{res['precision']*100:.1f}%",
        res['n_trades'],
    ]], headers=["Modelo","Return","Sharpe","MaxDD","Accuracy","Precision","Trades"],
       tablefmt="github"))
    print("═"*60)
    print(f"\n  Costo total comisiones: {res['n_trades'] * 2 * 0.0006 * 100:.3f}%")
    print(f"  Histéresis: long>0.539, exit<0.502")
    print(f"  Neutros excluidos del entrenamiento (Bug 3 corregido)")

# ... (debajo de los prints de "Neutros excluidos...")

    # ── SECCIÓN DE EXPORTACIÓN PARA PRODUCCIÓN ────────────────────────────
    import joblib
    import json

    # Definir nombres de archivos
    MODEL_NAME  = "btc_xgboost_v2.json"
    SCALER_NAME = "scaler_v2.bin"
    META_NAME   = "model_metadata.json"

    print(f"\n{'═'*30}\n EXPORTANDO MODELO\n{'═'*30}")

    # 1. Guardar el modelo (Formato nativo de XGBoost)
    # Usamos save_model para máxima compatibilidad en la app
    model.get_booster().save_model(MODEL_NAME)
    print(f" -> Modelo guardado: {MODEL_NAME}")

    # 2. Guardar el Scaler (Vital para normalizar datos en vivo)
    joblib.dump(scaler, SCALER_NAME)
    print(f" -> Escalador guardado: {SCALER_NAME}")

    # 3. Guardar Metadatos (Para que la app sepa qué features usar y en qué orden)
    metadata = {
        "symbol": SYMBOL,
        "sequence_length": SEQ_LEN,
        "features": features,  # Lista de nombres de columnas
        "thresholds": {
            "long": 0.539,
            "exit": 0.502
        },
        "metrics_at_train": {
            "accuracy": f"{res['accuracy']*100:.2f}%",
            "precision": f"{res['precision']*100:.2f}%"
        }
    }
    
    with open(META_NAME, "w") as f:
        json.dump(metadata, f, indent=4)
    print(f" -> Metadatos guardados: {META_NAME}")
    
    print(f"\n✅ ¡Todo listo! Copia estos 3 archivos a la carpeta de tu App.")


if __name__ == "__main__":
    run_experiment()