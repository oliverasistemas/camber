-- Camber Credit 2026-1 — reference data
SET search_path TO camber_credit;

INSERT INTO lease_status_types (status_code, name) VALUES
  (0, 'Active'),
  (1, 'In inventory'),
  (2, 'Sold');
