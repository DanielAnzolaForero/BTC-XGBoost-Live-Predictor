"""
tests/test_preprocessing.py
------------------------------
Unit tests for DataPreprocessor and PredictorService core logic.
Run with: pytest tests/ -v
"""
import os
import sys
import json
import numpy as np
import pandas as pd
import pytest

# Make sure the project root is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.ml_service.src.preprocessing_v2 import DataPreprocessor


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

def make_ohlcv(n: int = 300) -> pd.DataFrame:
    """
    Generates a synthetic single-timeframe OHLCV dataframe
    that mimics the 1h feed from Binance.
    Prices follow a simple random walk so ATR / returns are non-zero.
    """
    rng = np.random.default_rng(42)
    close = 30_000 + np.cumsum(rng.normal(0, 200, n))
    open_  = close - rng.uniform(-150, 150, n)
    high   = np.maximum(close, open_) + rng.uniform(0, 100, n)
    low    = np.minimum(close, open_) - rng.uniform(0, 100, n)
    volume = rng.uniform(1_000, 5_000, n)

    timestamps = pd.date_range("2024-01-01", periods=n, freq="1h")
    df = pd.DataFrame({
        "open_time": timestamps,
        "open":      open_,
        "high":      high,
        "low":       low,
        "close":     close,
        "volume":    volume,
        "quote_vol": close * volume,
        "num_trades": rng.integers(100, 1000, n).astype(float),
        "taker_buy_vol": volume * rng.uniform(0.4, 0.6, n),
    })
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Tests — DataPreprocessor
# ─────────────────────────────────────────────────────────────────────────────

class TestDataPreprocessor:

    def test_instantiation_defaults(self):
        """DataPreprocessor initialises with documented default parameters."""
        dp = DataPreprocessor()
        assert dp.sequence_length   == 30
        assert dp.look_ahead_macro  == 24
        assert dp.tp_macro          == 1.5
        assert dp.sl_macro          == 1.0

    def test_add_indicators_returns_dataframe(self):
        """add_indicators should return a pandas DataFrame."""
        df = make_ohlcv(300)
        dp = DataPreprocessor(sequence_length=30)
        result = dp.add_indicators(df)
        assert isinstance(result, pd.DataFrame), "Result must be a DataFrame"

    def test_momentum_columns_exist(self):
        """Key momentum features must be present after preprocessing."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        required = ["ret_1h", "ret_4h", "ret_24h", "ret_168h",
                    "mom_accel_4", "mom_accel_24"]
        for col in required:
            assert col in result.columns, f"Missing feature: {col}"

    def test_candle_structure_columns_exist(self):
        """Candle structure features must be present."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        for col in ["body_ratio", "upper_wick", "lower_wick", "body_size", "is_bullish"]:
            assert col in result.columns, f"Missing feature: {col}"

    def test_no_raw_ohlcv_columns_leak(self):
        """Raw OHLCV columns must be dropped from the output."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        for col in ["open", "high", "low", "close", "volume"]:
            assert col not in result.columns, f"Raw column leaked: {col}"

    def test_target_columns_exist(self):
        """Triple-Barrier target columns must be present."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        assert "target_macro" in result.columns
        assert "target_micro" in result.columns

    def test_target_values_are_valid(self):
        """target_macro values must only be 0, 1, or 2."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        assert set(result["target_macro"].unique()).issubset({0, 1, 2})

    def test_no_infinite_values(self):
        """Processed dataframe must not contain any infinite values."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        numeric = result.select_dtypes(include=[np.number])
        assert not np.isinf(numeric.values).any(), "Infinite values found in output"

    def test_is_bullish_binary(self):
        """is_bullish feature must be strictly 0 or 1."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        assert set(result["is_bullish"].unique()).issubset({0, 1})

    def test_vol_regime_binary(self):
        """vol_regime must be 0 or 1 (high vs low volatility regime)."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        assert set(result["vol_regime"].unique()).issubset({0, 1})

    def test_cyclical_time_encoding(self):
        """Cyclical time features must be in [-1, 1] range."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        for col in ["hour_sin", "hour_cos", "dow_sin", "dow_cos"]:
            assert col in result.columns, f"Missing cyclical feature: {col}"
            assert result[col].between(-1.0, 1.0).all(), f"{col} out of [-1, 1] range"

    def test_atr_rel_positive(self):
        """atr_rel must always be positive (relative ATR)."""
        df = make_ohlcv(300)
        dp = DataPreprocessor()
        result = dp.add_indicators(df)
        assert (result["atr_rel"] > 0).all(), "atr_rel contains non-positive values"

    def test_deeper_history_produces_more_rows(self):
        """More input rows should produce more processed rows (after warm-up)."""
        dp = DataPreprocessor()
        r_small = dp.add_indicators(make_ohlcv(250))
        r_large = dp.add_indicators(make_ohlcv(500))
        assert len(r_large) > len(r_small)


# ─────────────────────────────────────────────────────────────────────────────
# Tests — model_metadata.json integrity
# ─────────────────────────────────────────────────────────────────────────────

class TestModelMetadata:

    @pytest.fixture
    def metadata(self):
        path = os.path.join(
            os.path.dirname(__file__),
            "..", "backend", "app", "models_files", "model_metadata.json"
        )
        with open(path) as f:
            return json.load(f)

    def test_metadata_has_required_keys(self, metadata):
        for key in ["symbol", "features", "thresholds", "metrics_at_train"]:
            assert key in metadata, f"Missing key in metadata: {key}"

    def test_features_list_is_non_empty(self, metadata):
        assert len(metadata["features"]) > 0

    def test_thresholds_values_between_0_and_1(self, metadata):
        for k, v in metadata["thresholds"].items():
            assert 0.0 < v < 1.0, f"Threshold {k}={v} out of (0, 1)"

    def test_long_threshold_greater_than_exit(self, metadata):
        """Long entry threshold should be strictly above exit threshold."""
        t = metadata["thresholds"]
        assert t["long"] > t["exit"], "long threshold must be above exit threshold"
