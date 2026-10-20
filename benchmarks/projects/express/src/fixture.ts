import type { UserInput } from './contracts';

export function createUsers(count: number): UserInput[] {
  return Array.from({ length: count }, (_, index): UserInput => ({
    id: index + 1,
    name: `User ${index + 1}`,
    email: `user-${index + 1}@example.com`,
    passwordHash: `hash-${index + 1}`,
    active: index % 2 === 0,
  }));
}
