import { strict as assert } from 'node:assert';
import { convertCsv, createCsv } from './converter';

const result = convertCsv(createCsv(100, 10));
assert.equal(result.rows.length, 90);
assert.equal(result.rejected, 10);
assert.equal(Object.hasOwn(result.rows[0], 'passwordHash'), false);
assert.equal(result.rows[0].email, 'user-1@example.com');
assert.equal(result.rows.at(-1)?.id, 99);
assert.equal(Object.isFrozen(result.rows[0]), process.env.TS_TYPED_EXPECTS_FREEZE === '1');
process.stdout.write('csv self-test: ok\n');
