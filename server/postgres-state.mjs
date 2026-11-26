import pg from 'pg';
import { GalaxyState } from '../public/js/galaxy-state.mjs';

const readState = 'SELECT state FROM galaxy_relay_state WHERE id = 1';

function restore(result) {
  if (result.rowCount !== 1) {
    throw new Error('Galaxy state is missing. Apply server/galaxy-state.sql.');
  }
  return GalaxyState.fromSavedState(result.rows[0].state);
}

export async function openPostgresState(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    enableChannelBinding: true,
    max: 2,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
    statement_timeout: 8000,
  });
  pool.on('error', error => console.error('[database] idle connection lost:', error.code ?? error.name));

  try {
    return {
      initialState: restore(await pool.query(readState)),

      async applyEvent(event) {
        const client = await pool.connect();
        let discardClient = false;
        try {
          await client.query('BEGIN');
          const state = restore(await client.query(readState + ' FOR UPDATE'));
          const result = state.applyEvent(event);
          if (result.ok) {
            await client.query('UPDATE galaxy_relay_state SET state = $1 WHERE id = 1', [state.toSavedState()]);
          }
          await client.query('COMMIT');
          return { state, result };
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch {
            discardClient = true;
          }
          throw error;
        } finally {
          client.release(discardClient);
        }
      },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
