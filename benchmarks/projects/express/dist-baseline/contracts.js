"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toResponse = toResponse;
exports.toResponses = toResponses;
exports.toOptimizedResponses = toOptimizedResponses;
exports.summarize = summarize;
exports.acceptUnknownUser = acceptUnknownUser;
const validators_1 = require("@ts-typed/validators");
const compiler_1 = require("@ts-typed/compiler");
const stringSchema = { kind: 'primitive', name: 'string' };
const numberSchema = { kind: 'primitive', name: 'number' };
const booleanSchema = { kind: 'primitive', name: 'boolean' };
const responseSchema = {
    kind: 'object',
    properties: {
        id: { schema: numberSchema },
        name: { schema: stringSchema },
        email: { schema: stringSchema },
        active: { schema: booleanSchema },
    },
};
const responseListSchema = { kind: 'array', items: responseSchema };
const optimizedContext = {
    contractKind: 'return',
    operation: 'return',
    propertyPath: 'ExpressUsers.optimized',
};
function toResponse(input) {
    const email = new validators_1.Email(input.email);
    return {
        id: input.id,
        name: input.name,
        email: email.toString(),
        active: input.active,
    };
}
function toResponses(inputs) {
    return inputs.map((input) => toResponse(input));
}
function toOptimizedResponses(inputs) {
    const projectedWithContracts = inputs.map((input) => {
        const email = new validators_1.Email(input.email);
        return { id: input.id, name: input.name, email: email.toString(), active: input.active };
    });
    const projected = JSON.parse(JSON.stringify(projectedWithContracts));
    return (0, compiler_1.protectOptimizedImmutableValue)(responseListSchema, projected, optimizedContext);
}
function summarize(users) {
    return {
        count: users.length,
        firstEmail: users[0]?.email ?? '',
        activeCount: users.reduce((count, user) => count + (user.active ? 1 : 0), 0),
    };
}
function acceptUnknownUser(value) {
    return value;
}
//# sourceMappingURL=contracts.js.map