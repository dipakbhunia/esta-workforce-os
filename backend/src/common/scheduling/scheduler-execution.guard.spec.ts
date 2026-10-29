import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SchedulerExecutionGuard } from './scheduler-execution.guard';

describe('SchedulerExecutionGuard', () => {
  it('preserves scheduler execution by default without querying runtime identity', async () => {
    let queries = 0;
    const guard = new SchedulerExecutionGuard(
      { get: () => false } as never,
      { $queryRaw: async () => { queries += 1; return []; } } as never,
    );
    await guard.onApplicationBootstrap();
    assert.equal(guard.shouldExecute(), true);
    assert.equal(queries, 0);
  });

  it('keeps scheduled execution suppressed after exact live QA identity authorization', async () => {
    const guard = new SchedulerExecutionGuard(
      { get: () => true } as never,
      { $queryRaw: async () => [{
        databaseName: 'esta_sac24_qa2b_20261029',
        databaseUser: 'esta_sac24_qa2b_app',
        serverPort: 5432,
        systemIdentifier: '7701956771624615970',
      }] } as never,
    );
    assert.equal(guard.shouldExecute(), false);
    await guard.onApplicationBootstrap();
    assert.equal(guard.shouldExecute(), false);
  });

  it('fails startup closed and keeps schedulers suppressed when live identity differs', async () => {
    const guard = new SchedulerExecutionGuard(
      { get: () => true } as never,
      { $queryRaw: async () => [{
        databaseName: 'esta_workforce',
        databaseUser: 'esta_sac24_qa2b_app',
        serverPort: 5432,
        systemIdentifier: '7701956771624615970',
      }] } as never,
    );
    await assert.rejects(
      () => guard.onApplicationBootstrap(),
      /QA browser acceptance scheduler authorization failed/,
    );
    assert.equal(guard.shouldExecute(), false);
  });
});
