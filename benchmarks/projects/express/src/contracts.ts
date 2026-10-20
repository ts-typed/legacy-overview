import { Email } from '@ts-typed/validators';
import { protectOptimizedImmutableValue } from '@ts-typed/compiler';
import type { AssertionContext } from '@ts-typed/compiler';
import type { Schema } from '@ts-typed/compiler';

export interface UserInput {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly active: boolean;
}

export interface UserResponse {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly active: boolean;
}

export interface UserSummary {
  readonly count: number;
  readonly firstEmail: string;
  readonly activeCount: number;
}

const stringSchema: Schema = { kind: 'primitive', name: 'string' };
const numberSchema: Schema = { kind: 'primitive', name: 'number' };
const booleanSchema: Schema = { kind: 'primitive', name: 'boolean' };
const responseSchema: Schema = {
  kind: 'object',
  properties: {
    id: { schema: numberSchema },
    name: { schema: stringSchema },
    email: { schema: stringSchema },
    active: { schema: booleanSchema },
  },
};
const responseListSchema: Schema = { kind: 'array', items: responseSchema };
const optimizedContext: AssertionContext = {
  contractKind: 'return',
  operation: 'return',
  propertyPath: 'ExpressUsers.optimized',
};

export function toResponse(input: UserInput): UserResponse {
  const email = new Email(input.email);
  return {
    id: input.id,
    name: input.name,
    email: email.toString(),
    active: input.active,
  };
}

export function toResponses(inputs: readonly UserInput[]): readonly UserResponse[] {
  return inputs.map((input) => toResponse(input));
}

export function toOptimizedResponses(inputs: readonly UserInput[]): unknown {
  const projectedWithContracts = inputs.map((input) => {
    const email = new Email(input.email);
    return { id: input.id, name: input.name, email: email.toString(), active: input.active };
  });
  const projected: unknown = JSON.parse(JSON.stringify(projectedWithContracts));
  return protectOptimizedImmutableValue(responseListSchema, projected, optimizedContext);
}

export function summarize(users: readonly UserResponse[]): UserSummary {
  return {
    count: users.length,
    firstEmail: users[0]?.email ?? '',
    activeCount: users.reduce((count, user) => count + (user.active ? 1 : 0), 0),
  };
}

export function acceptUnknownUser(value: unknown): UserInput {
  return value as UserInput;
}
