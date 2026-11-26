CREATE TABLE IF NOT EXISTS galaxy_relay_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object')
);

INSERT INTO galaxy_relay_state (id, state)
VALUES (1, '{"version":1,"sequence":0,"totalAcquired":0,"reuseCount":0,"slots":[]}')
ON CONFLICT (id) DO NOTHING;
