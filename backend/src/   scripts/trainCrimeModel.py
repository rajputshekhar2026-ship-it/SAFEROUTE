#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Crime Prediction Model Training Script
Uses XGBoost to predict crime risk scores based on historical data
"""

import os
import sys
import json
import pickle
import argparse
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Tuple, Dict, Any, List
import warnings
warnings.filterwarnings('ignore')

# Machine Learning libraries
import xgboost as xgb
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report,
    mean_absolute_error, mean_squared_error, r2_score
)
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression, Ridge, Lasso
import joblib

# Database connection
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Constants
MODEL_PATH = os.getenv('CRIME_MODEL_PATH', './models/crime_prediction.pkl')
SCALER_PATH = os.getenv('SCALER_PATH', './models/scaler.pkl')
FEATURES_PATH = os.getenv('FEATURES_PATH', './models/features.json')
METRICS_PATH = os.getenv('METRICS_PATH', './models/metrics.json')
DATA_PATH = os.getenv('CRIME_DATA_PATH', './data/crime_history.csv')

# Feature columns
FEATURE_COLUMNS = [
    'hour', 'day_of_week', 'month', 'is_weekend', 'is_night',
    'latitude', 'longitude', 'crime_density_1km', 'crime_density_5km',
    'avg_severity_1km', 'avg_severity_5km', 'nearby_refuges_count',
    'distance_to_nearest_refuge', 'has_lighting', 'is_commercial_area',
    'population_density', 'historical_risk_score'
]

# Target column
TARGET_COLUMN = 'risk_score'

class CrimePredictionModel:
    """Crime Prediction Model using XGBoost"""
    
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.feature_importance = None
        self.metrics = {}
        self.label_encoders = {}
        
    def fetch_training_data(self, days_back: int = 365) -> pd.DataFrame:
        """
        Fetch crime history data from database
        """
        try:
            conn = psycopg2.connect(
                host=os.getenv('DB_HOST', 'localhost'),
                port=os.getenv('DB_PORT', 5432),
                database=os.getenv('DB_NAME', 'saferoute'),
                user=os.getenv('DB_USER', 'saferoute_user'),
                password=os.getenv('DB_PASSWORD', '')
            )
            
            query = f"""
            SELECT 
                ch.id,
                ST_X(ch.location::geometry) as longitude,
                ST_Y(ch.location::geometry) as latitude,
                ch.crime_type,
                ch.severity,
                ch.timestamp,
                EXTRACT(HOUR FROM ch.timestamp) as hour,
                EXTRACT(DOW FROM ch.timestamp) as day_of_week,
                EXTRACT(MONTH FROM ch.timestamp) as month,
                CASE WHEN EXTRACT(DOW FROM ch.timestamp) IN (0, 6) THEN 1 ELSE 0 END as is_weekend,
                CASE WHEN EXTRACT(HOUR FROM ch.timestamp) BETWEEN 22 OR EXTRACT(HOUR FROM ch.timestamp) < 6 THEN 1 ELSE 0 END as is_night,
                (
                    SELECT COUNT(*)
                    FROM crime_history ch2
                    WHERE ST_DWithin(ch.location, ch2.location, 1000)
                    AND ch2.timestamp > ch.timestamp - INTERVAL '30 days'
                ) as crime_density_1km,
                (
                    SELECT COUNT(*)
                    FROM crime_history ch2
                    WHERE ST_DWithin(ch.location, ch2.location, 5000)
                    AND ch2.timestamp > ch.timestamp - INTERVAL '30 days'
                ) as crime_density_5km,
                (
                    SELECT AVG(severity)
                    FROM crime_history ch2
                    WHERE ST_DWithin(ch.location, ch2.location, 1000)
                    AND ch2.timestamp > ch.timestamp - INTERVAL '30 days'
                ) as avg_severity_1km,
                (
                    SELECT AVG(severity)
                    FROM crime_history ch2
                    WHERE ST_DWithin(ch.location, ch2.location, 5000)
                    AND ch2.timestamp > ch.timestamp - INTERVAL '30 days'
                ) as avg_severity_5km,
                (
                    SELECT COUNT(*)
                    FROM refuges r
                    WHERE ST_DWithin(r.location, ch.location, 500)
                ) as nearby_refuges_count,
                (
                    SELECT MIN(ST_Distance(r.location, ch.location))
                    FROM refuges r
                ) as distance_to_nearest_refuge,
                CASE WHEN r.has_lighting THEN 1 ELSE 0 END as has_lighting,
                ch.severity as historical_risk_score
            FROM crime_history ch
            LEFT JOIN refuges r ON ST_DWithin(r.location, ch.location, 100)
            WHERE ch.timestamp > NOW() - INTERVAL '{days_back} days'
            GROUP BY ch.id, ch.location, ch.crime_type, ch.severity, ch.timestamp, r.has_lighting
            ORDER BY ch.timestamp
            """
            
            df = pd.read_sql(query, conn)
            conn.close()
            
            print(f"Fetched {len(df)} crime records from database")
            return df
            
        except Exception as e:
            print(f"Error fetching data from database: {e}")
            print("Loading from CSV file instead...")
            return self.load_from_csv()
    
    def load_from_csv(self) -> pd.DataFrame:
        """Load training data from CSV file"""
        if os.path.exists(DATA_PATH):
            df = pd.read_csv(DATA_PATH)
            print(f"Loaded {len(df)} records from {DATA_PATH}")
            return df
        else:
            print("No data found. Generating synthetic data for testing...")
            return self.generate_synthetic_data()
    
    def generate_synthetic_data(self, n_samples: int = 10000) -> pd.DataFrame:
        """Generate synthetic training data for testing"""
        np.random.seed(42)
        
        data = {
            'id': range(n_samples),
            'longitude': np.random.uniform(-74.02, -73.98, n_samples),
            'latitude': np.random.uniform(40.70, 40.75, n_samples),
            'crime_type': np.random.choice(['theft', 'assault', 'vandalism', 'robbery', 'harassment'], n_samples),
            'severity': np.random.randint(1, 6, n_samples),
            'timestamp': pd.date_range(start='2023-01-01', periods=n_samples, freq='H'),
            'hour': np.random.randint(0, 24, n_samples),
            'day_of_week': np.random.randint(0, 7, n_samples),
            'month': np.random.randint(1, 13, n_samples),
            'is_weekend': np.random.randint(0, 2, n_samples),
            'is_night': np.random.randint(0, 2, n_samples),
        }
        
        df = pd.DataFrame(data)
        
        # Add derived features
        df['crime_density_1km'] = np.random.poisson(5, n_samples)
        df['crime_density_5km'] = np.random.poisson(25, n_samples)
        df['avg_severity_1km'] = np.random.uniform(1, 5, n_samples)
        df['avg_severity_5km'] = np.random.uniform(1, 5, n_samples)
        df['nearby_refuges_count'] = np.random.poisson(3, n_samples)
        df['distance_to_nearest_refuge'] = np.random.exponential(200, n_samples)
        df['has_lighting'] = np.random.randint(0, 2, n_samples)
        df['is_commercial_area'] = np.random.randint(0, 2, n_samples)
        df['population_density'] = np.random.uniform(1000, 50000, n_samples)
        
        # Calculate risk score based on features
        df['risk_score'] = (
            df['severity'] * 15 +
            df['crime_density_1km'] * 2 +
            df['crime_density_5km'] * 0.5 +
            df['avg_severity_1km'] * 5 +
            (1 - df['nearby_refuges_count'] / 10) * 10 +
            df['is_night'] * 10 +
            (1 - df['has_lighting']) * 10 +
            np.random.normal(0, 5, n_samples)
        )
        df['risk_score'] = df['risk_score'].clip(0, 100)
        
        print(f"Generated {n_samples} synthetic records")
        return df
    
    def preprocess_data(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Preprocess data for training"""
        
        # Encode categorical variables
        categorical_cols = ['crime_type']
        for col in categorical_cols:
            if col in df.columns:
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col].astype(str))
                self.label_encoders[col] = le
        
        # Handle missing values
        df = df.fillna(df.median())
        
        # Select features
        available_features = [f for f in FEATURE_COLUMNS if f in df.columns]
        X = df[available_features].values
        y = df[TARGET_COLUMN].values
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        print(f"Preprocessed data: {X.shape[0]} samples, {X.shape[1]} features")
        print(f"Features used: {available_features}")
        
        return X_scaled, y
    
    def train_xgboost(self, X_train: np.ndarray, y_train: np.ndarray) -> xgb.XGBRegressor:
        """Train XGBoost model with hyperparameter tuning"""
        
        print("Training XGBoost model...")
        
        # Base model
        base_model = xgb.XGBRegressor(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1
        )
        
        # Hyperparameter grid
        param_grid = {
            'n_estimators': [100, 200, 300],
            'max_depth': [4, 6, 8, 10],
            'learning_rate': [0.01, 0.05, 0.1, 0.15],
            'subsample': [0.7, 0.8, 0.9],
            'colsample_bytree': [0.7, 0.8, 0.9]
        }
        
        # Grid search with cross-validation
        grid_search = GridSearchCV(
            base_model,
            param_grid,
            cv=5,
            scoring='neg_mean_absolute_error',
            n_jobs=-1,
            verbose=1
        )
        
        grid_search.fit(X_train, y_train)
        
        print(f"Best parameters: {grid_search.best_params_}")
        print(f"Best CV score: {-grid_search.best_score_:.4f}")
        
        return grid_search.best_estimator_
    
    def train_random_forest(self, X_train: np.ndarray, y_train: np.ndarray) -> RandomForestRegressor:
        """Train Random Forest model as baseline"""
        
        print("Training Random Forest model...")
        
        model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )
        
        model.fit(X_train, y_train)
        
        return model
    
    def train_gradient_boosting(self, X_train: np.ndarray, y_train: np.ndarray) -> GradientBoostingRegressor:
        """Train Gradient Boosting model"""
        
        print("Training Gradient Boosting model...")
        
        model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            subsample=0.8,
            random_state=42
        )
        
        model.fit(X_train, y_train)
        
        return model
    
    def evaluate_model(self, model, X_test: np.ndarray, y_test: np.ndarray) -> Dict[str, Any]:
        """Evaluate model performance"""
        
        y_pred = model.predict(X_test)
        
        # Regression metrics
        mae = mean_absolute_error(y_test, y_pred)
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        r2 = r2_score(y_test, y_pred)
        
        # For classification metrics (categorize risk scores)
        y_test_cat = pd.cut(y_test, bins=[0, 30, 70, 100], labels=['low', 'medium', 'high'])
        y_pred_cat = pd.cut(y_pred, bins=[0, 30, 70, 100], labels=['low', 'medium', 'high'])
        
        accuracy = accuracy_score(y_test_cat, y_pred_cat)
        
        metrics = {
            'mae': float(mae),
            'mse': float(mse),
            'rmse': float(rmse),
            'r2': float(r2),
            'accuracy': float(accuracy),
            'predictions': y_pred.tolist()[:10],  # First 10 predictions
            'actual': y_test.tolist()[:10]  # First 10 actual values
        }
        
        print(f"\nModel Evaluation Metrics:")
        print(f"Mean Absolute Error: {mae:.4f}")
        print(f"Root Mean Squared Error: {rmse:.4f}")
        print(f"R² Score: {r2:.4f}")
        print(f"Classification Accuracy: {accuracy:.4f}")
        
        return metrics
    
    def get_feature_importance(self, model, feature_names: List[str]) -> pd.DataFrame:
        """Extract feature importance from model"""
        
        if hasattr(model, 'feature_importances_'):
            importance = model.feature_importances_
        else:
            importance = np.zeros(len(feature_names))
        
        feature_importance_df = pd.DataFrame({
            'feature': feature_names,
            'importance': importance
        }).sort_values('importance', ascending=False)
        
        print("\nTop 10 Most Important Features:")
        print(feature_importance_df.head(10))
        
        return feature_importance_df
    
    def save_model(self, model, metrics: Dict, feature_importance: pd.DataFrame):
        """Save model and related files"""
        
        # Create models directory if not exists
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        
        # Save model
        joblib.dump(model, MODEL_PATH)
        print(f"Model saved to {MODEL_PATH}")
        
        # Save scaler
        joblib.dump(self.scaler, SCALER_PATH)
        print(f"Scaler saved to {SCALER_PATH}")
        
        # Save feature importance
        feature_importance_dict = feature_importance.to_dict('records')
        with open(FEATURES_PATH, 'w') as f:
            json.dump(feature_importance_dict, f, indent=2)
        print(f"Feature importance saved to {FEATURES_PATH}")
        
        # Save metrics
        with open(METRICS_PATH, 'w') as f:
            json.dump(metrics, f, indent=2)
        print(f"Metrics saved to {METRICS_PATH}")
        
        # Save label encoders
        encoders_path = os.path.join(os.path.dirname(MODEL_PATH), 'label_encoders.pkl')
        joblib.dump(self.label_encoders, encoders_path)
        print(f"Label encoders saved to {encoders_path}")
    
    def train(self, use_xgboost: bool = True):
        """Main training pipeline"""
        
        print("=" * 60)
        print("CRIME PREDICTION MODEL TRAINING")
        print("=" * 60)
        
        # Fetch and preprocess data
        print("\n1. Fetching training data...")
        df = self.fetch_training_data()
        
        print("\n2. Preprocessing data...")
        X, y = self.preprocess_data(df)
        
        # Split data
        print("\n3. Splitting data into train/test sets...")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        print(f"Training samples: {len(X_train)}")
        print(f"Test samples: {len(X_test)}")
        
        # Train model
        print("\n4. Training model...")
        if use_xgboost:
            model = self.train_xgboost(X_train, y_train)
        else:
            model = self.train_random_forest(X_train, y_train)
        
        # Evaluate model
        print("\n5. Evaluating model...")
        metrics = self.evaluate_model(model, X_test, y_test)
        
        # Get feature importance
        print("\n6. Computing feature importance...")
        available_features = [f for f in FEATURE_COLUMNS if f in df.columns]
        feature_importance = self.get_feature_importance(model, available_features)
        
        # Save model
        print("\n7. Saving model...")
        self.save_model(model, metrics, feature_importance)
        
        # Compare with baseline models
        print("\n8. Comparing with baseline models...")
        self.compare_models(X_train, X_test, y_train, y_test)
        
        print("\n" + "=" * 60)
        print("TRAINING COMPLETED SUCCESSFULLY!")
        print("=" * 60)
        
        return model, metrics
    
    def compare_models(self, X_train, X_test, y_train, y_test):
        """Compare different model performances"""
        
        models = {
            'XGBoost': self.train_xgboost(X_train, y_train),
            'Random Forest': self.train_random_forest(X_train, y_train),
            'Gradient Boosting': self.train_gradient_boosting(X_train, y_train),
            'Linear Regression': LinearRegression(),
            'Ridge Regression': Ridge(alpha=1.0),
            'Lasso Regression': Lasso(alpha=1.0)
        }
        
        results = []
        for name, model in models.items():
            try:
                if name in ['Linear Regression', 'Ridge Regression', 'Lasso Regression']:
                    model.fit(X_train, y_train)
                
                y_pred = model.predict(X_test)
                mae = mean_absolute_error(y_test, y_pred)
                rmse = np.sqrt(mean_squared_error(y_test, y_pred))
                r2 = r2_score(y_test, y_pred)
                
                results.append({
                    'model': name,
                    'MAE': mae,
                    'RMSE': rmse,
                    'R²': r2
                })
            except Exception as e:
                print(f"Error training {name}: {e}")
        
        results_df = pd.DataFrame(results)
        print("\nModel Comparison:")
        print(results_df.to_string(index=False))
        
        return results_df

def predict_risk(lat: float, lng: float, model=None, scaler=None) -> Dict[str, Any]:
    """Predict risk score for a given location"""
    
    if model is None:
        model = joblib.load(MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)
    
    # Extract features for the location
    now = datetime.now()
    features = {
        'hour': now.hour,
        'day_of_week': now.weekday(),
        'month': now.month,
        'is_weekend': 1 if now.weekday() >= 5 else 0,
        'is_night': 1 if now.hour >= 22 or now.hour < 6 else 0,
        'latitude': lat,
        'longitude': lng,
        'crime_density_1km': 0,  # Would be fetched from DB
        'crime_density_5km': 0,
        'avg_severity_1km': 0,
        'avg_severity_5km': 0,
        'nearby_refuges_count': 0,
        'distance_to_nearest_refuge': 0,
        'has_lighting': 1,
        'is_commercial_area': 0,
        'population_density': 0,
        'historical_risk_score': 0
    }
    
    # Convert to array
    feature_array = np.array([list(features.values())])
    feature_scaled = scaler.transform(feature_array)
    
    # Predict
    risk_score = model.predict(feature_scaled)[0]
    risk_score = np.clip(risk_score, 0, 100)
    
    # Determine risk level
    if risk_score < 30:
        risk_level = 'low'
        color_code = 'green'
    elif risk_score < 70:
        risk_level = 'medium'
        color_code = 'yellow'
    else:
        risk_level = 'high'
        color_code = 'red'
    
    return {
        'risk_score': float(risk_score),
        'risk_level': risk_level,
        'color_code': color_code,
        'confidence': 0.85,
        'timestamp': datetime.now().isoformat()
    }

def main():
    parser = argparse.ArgumentParser(description='Train Crime Prediction Model')
    parser.add_argument('--model', type=str, default='xgboost', 
                       choices=['xgboost', 'random_forest', 'all'],
                       help='Model type to train')
    parser.add_argument('--predict', action='store_true',
                       help='Run prediction after training')
    parser.add_argument('--lat', type=float, default=40.7128,
                       help='Latitude for prediction')
    parser.add_argument('--lng', type=float, default=-74.0060,
                       help='Longitude for prediction')
    
    args = parser.parse_args()
    
    if args.predict:
        # Load existing model and predict
        prediction = predict_risk(args.lat, args.lng)
        print("\nPrediction Result:")
        print(json.dumps(prediction, indent=2))
    else:
        # Train new model
        trainer = CrimePredictionModel()
        use_xgboost = args.model in ['xgboost', 'all']
        model, metrics = trainer.train(use_xgboost=use_xgboost)
        
        print("\nFinal Model Metrics:")
        print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    main()
