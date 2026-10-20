import { strict as assert } from 'node:assert';
import { acceptUnknownUser, summarize, toResponse, toResponses, type UserInput } from './contracts';
import { createUsers } from './fixture';

const users = createUsers(50);
const responses = toResponses(users);
assert.equal(responses.length, 50);
assert.equal(Object.hasOwn(responses[0], 'passwordHash'), false);
assert.equal(Object.isFrozen(responses[0]), process.env.TS_TYPED_EXPECTS_FREEZE === '1');
assert.equal(summarize(responses).activeCount, 25);
assert.equal(new Set(responses.map((user) => user.email)).size, 50);

const valid = acceptUnknownUser(users[0]);
assert.equal(toResponse(valid).email, 'user-1@example.com');

let rejected = false;
try {
  toResponse({ ...users[0], active: 'yes' } as unknown as UserInput);
} catch (error: unknown) {
  rejected = error instanceof TypeError;
}
assert.equal(rejected, process.env.TS_TYPED_EXPECTS_REJECTION === '1');
process.stdout.write('express self-test: ok\n');
