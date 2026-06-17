-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'analyst',
  avatar_initials TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Venues table
CREATE TABLE venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  venue_type TEXT NOT NULL DEFAULT 'other',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  lat REAL,
  lng REAL,
  google_maps_url TEXT,
  district TEXT,
  environment_type TEXT DEFAULT 'urban',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Assessments table
CREATE TABLE assessments (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  intel_summary TEXT,
  analyst_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Assessment versions table
CREATE TABLE assessment_versions (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risk matrix table
CREATE TABLE risk_matrix (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE UNIQUE,
  area_risk TEXT DEFAULT 'unknown',
  access_control TEXT DEFAULT 'unknown',
  arrival_departure TEXT DEFAULT 'unknown',
  parking TEXT DEFAULT 'unknown',
  personnel TEXT DEFAULT 'unknown',
  medical TEXT DEFAULT 'unknown',
  hse TEXT DEFAULT 'unknown',
  extraction TEXT DEFAULT 'unknown',
  overall_rating TEXT DEFAULT 'unknown',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log table
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risks table
CREATE TABLE risks (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  likelihood INTEGER NOT NULL DEFAULT 1,
  impact INTEGER NOT NULL DEFAULT 1,
  mitigation TEXT,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Incidents table
CREATE TABLE incidents (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  incident_date TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  lat REAL,
  lng REAL,
  distance_from_venue REAL,
  confidence_level TEXT DEFAULT 'medium',
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evidence table
CREATE TABLE evidence (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  label TEXT NOT NULL,
  content TEXT,
  url TEXT,
  filename TEXT,
  section TEXT,
  analyst_note TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alerts table
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OSINT events table
CREATE TABLE osint_events (
  id SERIAL PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  lat REAL,
  lng REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  analyst_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Routes table
CREATE TABLE routes (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  route_name TEXT NOT NULL,
  route_type TEXT NOT NULL DEFAULT 'primary_extraction',
  creation_method TEXT NOT NULL DEFAULT 'endpoint_marker',
  start_label TEXT,
  start_lat REAL,
  start_lng REAL,
  end_label TEXT,
  end_lat REAL,
  end_lng REAL,
  waypoints_json JSONB,
  route_geometry_geojson JSONB,
  original_drawn_geometry_geojson JSONB,
  snapped_route_geometry_geojson JSONB,
  snapped_to_roads BOOLEAN NOT NULL DEFAULT false,
  route_provider TEXT,
  travel_mode TEXT NOT NULL DEFAULT 'driving',
  routing_api_response_json JSONB,
  estimated_distance REAL,
  estimated_travel_time INTEGER,
  constraints JSONB,
  analyst_notes TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Route findings table
CREATE TABLE route_findings (
  id SERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  assessment_id INTEGER REFERENCES assessments(id) ON DELETE SET NULL,
  venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  summary TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  distance_from_route REAL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified BOOLEAN NOT NULL DEFAULT false,
  analyst_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE osint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_findings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for authenticated users
CREATE POLICY "allow_all_users" ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_venues" ON venues FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_assessments" ON assessments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_assessment_versions" ON assessment_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_risk_matrix" ON risk_matrix FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_audit_log" ON audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_risks" ON risks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_incidents" ON incidents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_evidence" ON evidence FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_alerts" ON alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_osint_events" ON osint_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_routes" ON routes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_route_findings" ON route_findings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create indexes for foreign keys and common queries
CREATE INDEX idx_assessments_venue_id ON assessments(venue_id);
CREATE INDEX idx_assessments_created_by ON assessments(created_by);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessment_versions_assessment_id ON assessment_versions(assessment_id);
CREATE INDEX idx_risk_matrix_assessment_id ON risk_matrix(assessment_id);
CREATE INDEX idx_audit_log_assessment_id ON audit_log(assessment_id);
CREATE INDEX idx_risks_assessment_id ON risks(assessment_id);
CREATE INDEX idx_incidents_venue_id ON incidents(venue_id);
CREATE INDEX idx_evidence_assessment_id ON evidence(assessment_id);
CREATE INDEX idx_alerts_venue_id ON alerts(venue_id);
CREATE INDEX idx_osint_events_venue_id ON osint_events(venue_id);
CREATE INDEX idx_routes_assessment_id ON routes(assessment_id);
CREATE INDEX idx_routes_venue_id ON routes(venue_id);
CREATE INDEX idx_route_findings_route_id ON route_findings(route_id);