"""Flask API for the credit card dashboard backend."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

try:  # pragma: no cover - optional dependency handling
    import joblib
except ImportError:  # pragma: no cover
    joblib = None  # type: ignore


LOGGER = logging.getLogger("credit_card_dashboard")
if not LOGGER.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    handler.setFormatter(formatter)
    LOGGER.addHandler(handler)
LOGGER.setLevel(logging.INFO)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "outputs"
FEATURE_IMPORTANCE_PATH = DATA_DIR / "feature_importance.json"
MONTHLY_FEATURES_PATH = DATA_DIR / "monthly_features.csv"
MODEL_PATH = DATA_DIR / "xgb_spending_model.joblib"

DEFAULT_FEATURES: List[Dict[str, Any]] = [
    {"name": "NumberOfTransactionsPerMonth", "importance": 0.6683},
    {"name": "DaysSinceLastTransaction", "importance": 0.1569},
    {"name": "WeekendSpendingRatio", "importance": 0.1290},
    {"name": "TotalWeekendSpending", "importance": 0.0054},
    {"name": "Occupation_Engineer", "importance": 0.0028},
    {"name": "AvgTransactionAmount", "importance": 0.0027},
    {"name": "Occupation_Doctor", "importance": 0.0027},
    {"name": "City_Hai Phong", "importance": 0.0026},
    {"name": "MaritalStatus_Single", "importance": 0.0024},
    {"name": "MaritalStatus_Married", "importance": 0.0021},
    {"name": "TotalCASABalance", "importance": 0.0020},
    {"name": "MaxMonthlySpend", "importance": 0.0020},
    {"name": "Age", "importance": 0.0019},
    {"name": "Income", "importance": 0.0019},
    {"name": "Occupation_Teacher", "importance": 0.0018},
]

DEFAULT_OVERVIEW = {
    "total_rows": 600_000,
    "unique_customers": 50_000,
    "months_covered": 13,
    "mean_monthly_spending": 20_000.0,
    "avg_txn_per_month": 25.0,
}

REQUIRED_PREDICT_FIELDS: List[str] = [
    "AvgTransactionAmount",
    "NumberOfTransactionsPerMonth",
    "MaxMonthlySpend",
    "TotalWeekendSpending",
    "DaysSinceLastTransaction",
    "WeekendSpendingRatio",
    "Age",
    "Income",
    "TotalCASABalance",
    "TotalFixedDepositBalance",
    "TotalLoanOrgAmount",
    "TotalLoanEMIAmount",
    "AvgLoanToIncomeRatio",
    "AvgDebtToIncomeRatio",
    "MonthlyCreditUtilizationRate",
]

_MODEL: Optional[Any] = None
_MODEL_LOAD_ATTEMPTED = False


def load_json_safe(path: Path) -> Optional[Dict[str, Any]]:
    """Safely load a JSON file, returning None when unavailable or invalid."""
    if not path.exists():
        LOGGER.info("JSON file not found at %s", path)
        return None

    try:
        with path.open("r", encoding="utf-8") as file_handle:
            data = json.load(file_handle)
    except (OSError, json.JSONDecodeError) as exc:
        LOGGER.warning("Failed to load JSON from %s: %s", path, exc)
        return None

    if isinstance(data, dict):
        return data

    LOGGER.warning("JSON at %s is not a dictionary", path)
    return None


def load_csv_safe(path: Path) -> Optional[pd.DataFrame]:
    """Safely load a CSV file, returning None when unavailable or invalid."""
    if not path.exists():
        LOGGER.info("CSV file not found at %s", path)
        return None

    try:
        dataframe = pd.read_csv(path)
    except (OSError, pd.errors.ParserError) as exc:
        LOGGER.warning("Failed to load CSV from %s: %s", path, exc)
        return None

    if not isinstance(dataframe, pd.DataFrame):
        LOGGER.warning("Loaded object from %s is not a DataFrame", path)
        return None

    return dataframe


def get_model() -> Optional[Any]:
    """Load and cache the prediction model, returning None if unavailable."""
    global _MODEL, _MODEL_LOAD_ATTEMPTED

    if _MODEL_LOAD_ATTEMPTED:
        return _MODEL

    _MODEL_LOAD_ATTEMPTED = True

    if joblib is None:
        LOGGER.info("joblib is not available; using mock predictions")
        return None

    if not MODEL_PATH.exists():
        LOGGER.info("Model file not found at %s", MODEL_PATH)
        return None

    try:
        _MODEL = joblib.load(MODEL_PATH)
        LOGGER.info("Model loaded from %s", MODEL_PATH)
    except Exception as exc:  # pragma: no cover - defensive
        LOGGER.warning("Failed to load model from %s: %s", MODEL_PATH, exc)
        _MODEL = None

    return _MODEL


def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})

    @app.after_request
    def log_request(response):  # type: ignore[override]
        LOGGER.info("%s %s %s", request.method, request.path, response.status_code)
        return response

    @app.errorhandler(HTTPException)
    def handle_http_exception(error: HTTPException):
        LOGGER.warning("HTTP error %s: %s", error.code, error.description)
        response = {"error": error.description or "An error occurred"}
        return jsonify(response), error.code

    @app.errorhandler(Exception)
    def handle_exception(error: Exception):  # pragma: no cover - defensive
        LOGGER.exception("Unhandled exception: %s", error)
        return jsonify({"error": "Internal server error"}), 500

    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "ok", "service": "credit_card_dashboard"})

    @app.route("/api/feature-importance", methods=["GET"])
    def feature_importance():
        data = load_json_safe(FEATURE_IMPORTANCE_PATH)

        if data and isinstance(data.get("features"), Iterable):
            raw_features = data["features"]
            validated_features = _validate_feature_importance(raw_features)
            if validated_features:
                return jsonify({"features": validated_features})

        LOGGER.info("Using default feature importance values")
        return jsonify({"features": DEFAULT_FEATURES})

    @app.route("/api/metrics/overview", methods=["GET"])
    def metrics_overview():
        dataframe = load_csv_safe(MONTHLY_FEATURES_PATH)

        if dataframe is not None:
            metrics = _calculate_metrics_overview(dataframe)
            if metrics:
                return jsonify(metrics)

        LOGGER.info("Returning default overview metrics")
        return jsonify(DEFAULT_OVERVIEW)

    @app.route("/api/monthly-features", methods=["GET"])
    def monthly_features():
        page_raw = request.args.get("page", "1")
        page_size_raw = request.args.get("page_size", "50")
        customer_id = request.args.get("customer_id")
        year_month = request.args.get("year_month")

        try:
            page_value = int(page_raw)
            page_size_value = int(page_size_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "page and page_size must be integers"}), 400

        if page_value <= 0:
            return jsonify({"error": "page must be a positive integer"}), 400

        if page_size_value <= 0:
            return jsonify({"error": "page_size must be a positive integer"}), 400

        if page_size_value > 200:
            return jsonify({"error": "page_size must not exceed 200"}), 400

        customer_id = customer_id.strip() if isinstance(customer_id, str) else None
        year_month = year_month.strip() if isinstance(year_month, str) else None

        if year_month and not _is_valid_year_month(year_month):
            return jsonify({"error": "year_month must be in YYYY-MM format"}), 400

        if not MONTHLY_FEATURES_PATH.exists():
            return jsonify({"error": "Monthly features data not found"}), 404

        try:
            dataframe = pd.read_csv(MONTHLY_FEATURES_PATH)
        except (OSError, pd.errors.ParserError) as exc:
            LOGGER.warning("Failed to load monthly features data: %s", exc)
            return jsonify({"error": "Unable to load monthly features data"}), 500

        customer_column = _identify_column(
            dataframe.columns,
            ("CustomerID", "CustomerId", "customer_id", "customerID"),
        )

        if customer_column is None:
            LOGGER.warning("Customer identifier column not found for monthly features")
            return jsonify({"error": "CustomerID column not available"}), 500

        if "YearMonth" not in dataframe.columns:
            LOGGER.warning("YearMonth column not found for monthly features")
            return jsonify({"error": "YearMonth column not available"}), 500

        filtered = dataframe.copy()

        if customer_id:
            filtered = filtered[
                filtered[customer_column].astype(str).str.strip() == customer_id
            ]

        if year_month:
            filtered = filtered[filtered["YearMonth"].astype(str) == year_month]

        filtered = filtered.sort_values(
            by=[customer_column, "YearMonth"],
            ascending=[True, True],
            kind="mergesort",
        ).reset_index(drop=True)

        total_rows = int(filtered.shape[0])
        total_pages = (
            (total_rows + page_size_value - 1) // page_size_value if total_rows else 0
        )

        start_index = (page_value - 1) * page_size_value
        end_index = start_index + page_size_value

        paginated = filtered.iloc[start_index:end_index]
        paginated = paginated.where(pd.notnull(paginated), None)

        rows = paginated.to_dict(orient="records")

        response_payload = {
            "page": page_value,
            "page_size": page_size_value,
            "total_rows": total_rows,
            "total_pages": total_pages,
            "rows": rows,
        }

        return jsonify(response_payload)

    @app.route("/api/predict", methods=["POST"])
    def predict():
        payload = request.get_json(silent=True)
        if payload is None:
            return jsonify({"error": "Request body must be JSON"}), 400

        missing_fields = [field for field in REQUIRED_PREDICT_FIELDS if field not in payload]
        if missing_fields:
            message = ", ".join(missing_fields)
            LOGGER.warning("Prediction request missing fields: %s", message)
            return (
                jsonify({"error": f"missing fields: {missing_fields}"}),
                400,
            )

        try:
            numeric_payload = {
                field: _coerce_to_float(payload[field], field) for field in REQUIRED_PREDICT_FIELDS
            }
        except ValueError as exc:
            LOGGER.warning("Invalid payload value: %s", exc)
            return jsonify({"error": str(exc)}), 400

        model = get_model()
        if model is not None:
            try:
                input_frame = pd.DataFrame([numeric_payload])
                prediction_result = model.predict(input_frame)[0]
                prediction_value = float(prediction_result)
                return jsonify({"prediction": round(prediction_value, 2)})
            except Exception as exc:  # pragma: no cover - defensive
                LOGGER.warning("Model prediction failed, using mock formula: %s", exc)

        prediction_value = _mock_prediction(numeric_payload)
        return jsonify({"prediction": prediction_value})

    return app


def _coerce_to_float(value: Any, field_name: str) -> float:
    """Convert a value to float, raising ValueError when conversion fails."""
    if isinstance(value, (int, float)):
        return float(value)

    try:
        return float(str(value))
    except (TypeError, ValueError):
        raise ValueError(f"Field '{field_name}' must be numeric") from None


def _validate_feature_importance(raw_features: Any) -> Optional[List[Dict[str, float]]]:
    """Validate feature importance structure and return sanitized data."""
    if not isinstance(raw_features, Iterable):
        return None

    validated: List[Dict[str, float]] = []
    for item in raw_features:
        if not isinstance(item, dict):
            LOGGER.warning("Invalid feature item encountered: %s", item)
            return None

        name = item.get("name")
        importance = item.get("importance")
        if not isinstance(name, str):
            LOGGER.warning("Feature name is invalid: %s", item)
            return None
        try:
            importance_value = float(importance)
        except (TypeError, ValueError):
            LOGGER.warning("Feature importance is invalid for %s", name)
            return None
        validated.append({"name": name, "importance": importance_value})

    if not validated:
        return None

    return validated


def _calculate_metrics_overview(dataframe: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """Calculate overview metrics from the dataset, returning None on failure."""
    try:
        total_rows = int(len(dataframe))

        customer_column = _identify_column(
            dataframe.columns,
            ("CustomerID", "CustomerId", "customer_id", "customerID"),
        )
        if customer_column is None:
            raise KeyError("Customer identifier column not found")
        unique_customers = int(dataframe[customer_column].nunique(dropna=True))

        if "YearMonth" not in dataframe.columns:
            raise KeyError("YearMonth column not found")
        months_covered = int(dataframe["YearMonth"].nunique(dropna=True))

        mean_monthly_spending = _mean_of_column(dataframe, "MonthlyTotalSpending")
        avg_txn_per_month = _mean_of_column(
            dataframe, "NumberOfTransactionsPerMonth"
        )

        return {
            "total_rows": total_rows,
            "unique_customers": unique_customers,
            "months_covered": months_covered,
            "mean_monthly_spending": round(mean_monthly_spending, 2),
            "avg_txn_per_month": round(avg_txn_per_month, 2),
        }
    except Exception as exc:
        LOGGER.warning("Failed to compute metrics overview: %s", exc)
        return None


def _identify_column(columns: Iterable[str], candidates: Iterable[str]) -> Optional[str]:
    """Return the first matching column from candidates."""
    normalized_columns = {col.lower(): col for col in columns}
    for candidate in candidates:
        lower_candidate = candidate.lower()
        if lower_candidate in normalized_columns:
            return normalized_columns[lower_candidate]
    return None


def _mean_of_column(dataframe: pd.DataFrame, column_name: str) -> float:
    """Return the numeric mean of a column, raising ValueError when invalid."""
    if column_name not in dataframe.columns:
        raise KeyError(f"{column_name} column not found")

    numeric_series = pd.to_numeric(dataframe[column_name], errors="coerce")
    valid_series = numeric_series.dropna()
    if valid_series.empty:
        raise ValueError(f"No numeric data available for {column_name}")
    return float(valid_series.mean())


def _mock_prediction(features: Dict[str, float]) -> float:
    """Generate a deterministic mock prediction based on request features."""
    txn_component = (
        features["NumberOfTransactionsPerMonth"]
        * features["AvgTransactionAmount"]
        * (1 + features["WeekendSpendingRatio"] * 0.1)
        * 0.3
    )
    peak_component = features["MaxMonthlySpend"] * 0.2
    weekend_component = features["TotalWeekendSpending"] * 0.1

    prediction = txn_component + peak_component + weekend_component
    return round(max(prediction, 0.0), 2)


def _is_valid_year_month(value: str) -> bool:
    """Validate YYYY-MM formatted strings with a calendar-aware check."""
    if not isinstance(value, str):
        return False

    match = re.fullmatch(r"(\d{4})-(\d{2})", value)
    if not match:
        return False

    month = int(match.group(2))
    return 1 <= month <= 12


app = create_app()

if __name__ == "__main__":  # pragma: no cover - manual execution entry point
    app.run(host="0.0.0.0", port=5000, debug=True)
