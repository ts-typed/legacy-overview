"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const contracts_1 = require("./contracts");
const fixture_1 = require("./fixture");
const users = (0, fixture_1.createUsers)(50);
const responses = (0, contracts_1.toResponses)(users);
node_assert_1.strict.equal(responses.length, 50);
node_assert_1.strict.equal(Object.hasOwn(responses[0], 'passwordHash'), false);
node_assert_1.strict.equal(Object.isFrozen(responses[0]), process.env.TS_TYPED_EXPECTS_FREEZE === '1');
node_assert_1.strict.equal((0, contracts_1.summarize)(responses).activeCount, 25);
node_assert_1.strict.equal(new Set(responses.map((user) => user.email)).size, 50);
const valid = (0, contracts_1.acceptUnknownUser)(users[0]);
node_assert_1.strict.equal((0, contracts_1.toResponse)(valid).email, 'user-1@example.com');
let rejected = false;
try {
    (0, contracts_1.toResponse)({ ...users[0], active: 'yes' });
}
catch (error) {
    rejected = error instanceof TypeError;
}
node_assert_1.strict.equal(rejected, process.env.TS_TYPED_EXPECTS_REJECTION === '1');
process.stdout.write('express self-test: ok\n');
//# sourceMappingURL=self-test.js.map