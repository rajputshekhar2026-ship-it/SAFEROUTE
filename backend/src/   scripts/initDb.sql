-- ============================================
-- SAFE-ROUTE DATABASE SCHEMA
-- PostgreSQL + PostGIS
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    name VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    last_location GEOGRAPHY(POINT, 4326),
    last_active TIMESTAMP,
    emergency_contacts JSONB DEFAULT '[]'::jsonb,
    preferences JSONB DEFAULT '{
        "notifications": true,
        "darkMode": true,
        "voiceGuidance": true,
        "autoSOS": true,
        "shareLocation": true,
        "preferredRouteType": "safest",
        "alertRadius": 500
    }'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create indexes for users
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_location ON users USING GIST (last_location);
CREATE INDEX idx_users_last_active ON users(last_active);
CREATE INDEX idx_users_role ON users(role);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    refresh_token TEXT NOT NULL UNIQUE,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);

-- ============================================
-- ROUTES & NAVIGATION
-- ============================================

-- Routes table
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    path GEOGRAPHY(LINESTRING, 4326) NOT NULL,
    start_point GEOGRAPHY(POINT, 4326) NOT NULL,
    end_point GEOGRAPHY(POINT, 4326) NOT NULL,
    waypoints GEOGRAPHY(LINESTRING, 4326),
    distance_meters INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    risk_score FLOAT CHECK (risk_score >= 0 AND risk_score <= 100),
    lighting_score FLOAT CHECK (lighting_score >= 0 AND lighting_score <= 100),
    crime_risk_score FLOAT CHECK (crime_risk_score >= 0 AND crime_risk_score <= 100),
    route_type VARCHAR(20) CHECK (route_type IN ('fastest', 'safest', 'lit')),
    is_saved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

-- Spatial indexes for routes
CREATE INDEX idx_routes_path ON routes USING GIST (path);
CREATE INDEX idx_routes_start_point ON routes USING GIST (start_point);
CREATE INDEX idx_routes_end_point ON routes USING GIST (end_point);
CREATE INDEX idx_routes_user_id ON routes(user_id);
CREATE INDEX idx_routes_created_at ON routes(created_at);
CREATE INDEX idx_routes_route_type ON routes(route_type);
CREATE INDEX idx_routes_risk_score ON routes(risk_score);

-- Route deviations table
CREATE TABLE route_deviations (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
    deviation_distance INTEGER NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_route_deviations_user_id ON route_deviations(user_id);
CREATE INDEX idx_route_deviations_location ON route_deviations USING GIST (location);

-- ============================================
-- SAFETY & INCIDENTS
-- ============================================

-- Crime history table
CREATE TABLE crime_history (
    id SERIAL PRIMARY KEY,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    crime_type VARCHAR(100) NOT NULL,
    severity INTEGER CHECK (severity >= 1 AND severity <= 5),
    description TEXT,
    source VARCHAR(50) DEFAULT 'user_report',
    is_verified BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Spatial indexes for crime history
CREATE INDEX idx_crime_history_location ON crime_history USING GIST (location);
CREATE INDEX idx_crime_history_timestamp ON crime_history(timestamp);
CREATE INDEX idx_crime_history_crime_type ON crime_history(crime_type);
CREATE INDEX idx_crime_history_severity ON crime_history(severity);

-- Reports table (user-submitted incidents)
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    type VARCHAR(50) NOT NULL,
    severity INTEGER CHECK (severity >= 1 AND severity <= 5),
    description TEXT,
    media_urls TEXT[],
    is_anonymous BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'resolved', 'dismissed')),
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reports_location ON reports USING GIST (location);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE INDEX idx_reports_user_id ON reports(user_id);

-- ============================================
-- SAFE REFUGES
-- ============================================

-- Refuges table
CREATE TABLE refuges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('police', 'hospital', 'cafe', 'store', 'community_center', 'transit')),
    address TEXT,
    phone VARCHAR(20),
    hours JSONB,
    is_24_hours BOOLEAN DEFAULT FALSE,
    has_security BOOLEAN DEFAULT FALSE,
    has_lighting BOOLEAN DEFAULT FALSE,
    rating FLOAT CHECK (rating >= 0 AND rating <= 5),
    amenities TEXT[],
    emergency_services TEXT[],
    wheelchair_accessible BOOLEAN DEFAULT FALSE,
    capacity INTEGER,
    last_verified TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refuges_location ON refuges USING GIST (location);
CREATE INDEX idx_refuges_type ON refuges(type);
CREATE INDEX idx_refuges_rating ON refuges(rating);
CREATE INDEX idx_refuges_is_24_hours ON refuges(is_24_hours);

-- ============================================
-- SOS & EMERGENCY
-- ============================================

-- SOS events table
CREATE TABLE sos_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    audio_url TEXT,
    photo_urls TEXT[],
    message TEXT,
    contacts_notified JSONB,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'responded', 'resolved', 'cancelled')),
    responder_id UUID REFERENCES users(id),
    responded_at TIMESTAMP,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sos_events_user_id ON sos_events(user_id);
CREATE INDEX idx_sos_events_location ON sos_events USING GIST (location);
CREATE INDEX idx_sos_events_status ON sos_events(status);
CREATE INDEX idx_sos_events_created_at ON sos_events(created_at);

-- ============================================
-- CHECK-INS & LOCATION HISTORY
-- ============================================

-- Check-ins table
CREATE TABLE checkins (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    status VARCHAR(20) DEFAULT 'safe' CHECK (status IN ('safe', 'unsure', 'danger')),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checkins_user_id ON checkins(user_id);
CREATE INDEX idx_checkins_location ON checkins USING GIST (location);
CREATE INDEX idx_checkins_created_at ON checkins(created_at);
CREATE INDEX idx_checkins_status ON checkins(status);

-- Location history table (for path tracking)
CREATE TABLE location_history (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    speed FLOAT,
    heading INTEGER,
    accuracy FLOAT,
    is_background BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Partition location_history by month for better performance
CREATE INDEX idx_location_history_user_id ON location_history(user_id);
CREATE INDEX idx_location_history_location ON location_history USING GIST (location);
CREATE INDEX idx_location_history_created_at ON location_history(created_at);

-- ============================================
-- HEALTH MODE LOGS
-- ============================================

CREATE TABLE health_mode_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(20) CHECK (action IN ('activate', 'deactivate')),
    disguise_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_mode_logs_user_id ON health_mode_logs(user_id);
CREATE INDEX idx_health_mode_logs_created_at ON health_mode_logs(created_at);

-- ============================================
-- WATCH SYNC LOGS
-- ============================================

CREATE TABLE watch_sync_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_type VARCHAR(20) CHECK (device_type IN ('apple_watch', 'wear_os')),
    action VARCHAR(50),
    data JSONB,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_watch_sync_logs_user_id ON watch_sync_logs(user_id);
CREATE INDEX idx_watch_sync_logs_synced_at ON watch_sync_logs(synced_at);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    type VARCHAR(50) CHECK (type IN ('sos', 'alert', 'weather', 'crime', 'safety', 'system')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_type ON notifications(type);

-- ============================================
-- FEEDBACK & RATINGS
-- ============================================

CREATE TABLE feedback (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    route_id INTEGER REFERENCES routes(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_user_id ON feedback(user_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_created_at ON feedback(created_at);

-- ============================================
-- VIEWS & MATERIALIZED VIEWS
-- ============================================

-- Crime heatmap materialized view (refresh every 2 hours)
CREATE MATERIALIZED VIEW crime_heatmap AS
SELECT 
    ST_MakeEnvelope(
        MIN(ST_X(location::geometry)) - 0.1,
        MIN(ST_Y(location::geometry)) - 0.1,
        MAX(ST_X(location::geometry)) + 0.1,
        MAX(ST_Y(location::geometry)) + 0.1,
        4326
    ) as bbox,
    COUNT(*) as incident_count,
    AVG(severity) as avg_severity,
    crime_type,
    DATE_TRUNC('day', timestamp) as day
FROM crime_history
WHERE timestamp > NOW() - INTERVAL '90 days'
GROUP BY crime_type, DATE_TRUNC('day', timestamp);

CREATE UNIQUE INDEX idx_crime_heatmap_day_type ON crime_heatmap (day, crime_type);

-- Active users view
CREATE VIEW active_users AS
SELECT 
    u.id,
    u.name,
    u.email,
    u.last_location,
    u.last_active,
    COUNT(DISTINCT c.id) as checkin_count,
    MAX(c.created_at) as last_checkin
FROM users u
LEFT JOIN checkins c ON u.id = c.user_id AND c.created_at > NOW() - INTERVAL '24 hours'
WHERE u.last_active > NOW() - INTERVAL '1 hour'
GROUP BY u.id;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refuges_updated_at BEFORE UPDATE ON refuges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-delete expired sessions
CREATE OR REPLACE FUNCTION delete_expired_sessions()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_delete_expired_sessions
    AFTER INSERT ON sessions
    EXECUTE FUNCTION delete_expired_sessions();

-- Update user last_active on checkin
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET last_active = NOW() WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_last_active
    AFTER INSERT ON checkins
    FOR EACH ROW
    EXECUTE FUNCTION update_user_last_active();

-- ============================================
-- SEED DATA
-- ============================================

-- Insert sample refuges
INSERT INTO refuges (name, location, type, address, phone, is_24_hours, has_security, has_lighting, rating) VALUES
('Downtown Police Station', ST_GeomFromText('POINT(-74.0060 40.7128)', 4326), 'police', '123 Main St, Downtown', '+1-212-555-0123', true, true, true, 4.5),
('City General Hospital', ST_GeomFromText('POINT(-74.0080 40.7148)', 4326), 'hospital', '456 Health Ave, Downtown', '+1-212-555-0456', true, true, true, 4.8),
('Central Park Cafe', ST_GeomFromText('POINT(-74.0040 40.7108)', 4326), 'cafe', '789 Park Rd, Central Park', '+1-212-555-0789', false, false, true, 4.2),
('24/7 Safe Mart', ST_GeomFromText('POINT(-74.0100 40.7168)', 4326), 'store', '321 Market St', '+1-212-555-0321', true, true, true, 4.0),
('Community Center', ST_GeomFromText('POINT(-74.0020 40.7088)', 4326), 'community_center', '555 Community Dr', '+1-212-555-0555', false, true, true, 4.3),
('Grand Central Station', ST_GeomFromText('POINT(-74.0030 40.7138)', 4326), 'transit', '111 Grand Central', '+1-212-555-0111', true, true, true, 4.6),
('Safe Haven Cafe', ST_GeomFromText('POINT(-74.0050 40.7118)', 4326), 'cafe', '222 Safe St', '+1-212-555-0222', false, false, true, 4.1),
('Metro Police Precinct', ST_GeomFromText('POINT(-74.0090 40.7158)', 4326), 'police', '444 Metro Ave', '+1-212-555-0444', true, true, true, 4.4);

-- ============================================
-- MAINTENANCE FUNCTIONS
-- ============================================

-- Refresh crime heatmap (run by cron job every 2 hours)
CREATE OR REPLACE FUNCTION refresh_crime_heatmap()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY crime_heatmap;
END;
$$ LANGUAGE plpgsql;

-- Clean up old data (run by cron job daily)
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete location history older than 30 days
    DELETE FROM location_history WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Delete expired sessions
    DELETE FROM sessions WHERE expires_at < NOW();
    
    -- Delete old notifications (older than 90 days)
    DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days' AND is_read = true;
    
    -- Delete old SOS events (older than 1 year)
    UPDATE sos_events SET status = 'archived' WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PERMISSIONS
-- ============================================

-- Create application user (run separately with your credentials)
-- CREATE USER saferoute_app WITH PASSWORD 'secure_password';
-- GRANT CONNECT ON DATABASE saferoute TO saferoute_app;
-- GRANT USAGE ON SCHEMA public TO saferoute_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO saferoute_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO saferoute_app;

-- ============================================
-- VALIDATION FUNCTIONS
-- ============================================

-- Check if point is within city bounds
CREATE OR REPLACE FUNCTION is_within_bounds(lat FLOAT, lng FLOAT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate distance between two points in meters
CREATE OR REPLACE FUNCTION calculate_distance(lat1 FLOAT, lng1 FLOAT, lat2 FLOAT, lng2 FLOAT)
RETURNS FLOAT AS $$
DECLARE
    R FLOAT = 6371000; -- Earth radius in meters
    φ1 FLOAT = radians(lat1);
    φ2 FLOAT = radians(lat2);
    Δφ FLOAT = radians(lat2 - lat1);
    Δλ FLOAT = radians(lng2 - lng1);
    a FLOAT;
    c FLOAT;
BEGIN
    a = sin(Δφ/2) * sin(Δφ/2) +
        cos(φ1) * cos(φ2) *
        sin(Δλ/2) * sin(Δλ/2);
    c = 2 * atan2(sqrt(a), sqrt(1-a));
    RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON DATABASE saferoute IS 'Safe-Route Navigation System Database';
COMMENT ON TABLE users IS 'User accounts and authentication';
COMMENT ON TABLE routes IS 'Saved user routes with safety scoring';
COMMENT ON TABLE crime_history IS 'Historical crime data for risk prediction';
COMMENT ON TABLE reports IS 'User-submitted incident reports';
COMMENT ON TABLE refuges IS 'Safe places database';
COMMENT ON TABLE sos_events IS 'Emergency SOS event records';

-- ============================================
-- END OF SCHEMA
-- ============================================
