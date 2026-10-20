"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const converter_1 = require("./converter");
const result = (0, converter_1.convertCsv)((0, converter_1.createCsv)(100, 10));
node_assert_1.strict.equal(result.rows.length, 90);
node_assert_1.strict.equal(result.rejected, 10);
node_assert_1.strict.equal(Object.hasOwn(result.rows[0], 'passwordHash'), false);
node_assert_1.strict.equal(result.rows[0].email, 'user-1@example.com');
node_assert_1.strict.equal(result.rows.at(-1)?.id, 99);
node_assert_1.strict.equal(Object.isFrozen(result.rows[0]), process.env.TS_TYPED_EXPECTS_FREEZE === '1');
process.stdout.write('csv self-test: ok\n');
//# sourceMappingURL=self-test.js.map