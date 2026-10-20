"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUsers = createUsers;
function createUsers(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        name: `User ${index + 1}`,
        email: `user-${index + 1}@example.com`,
        passwordHash: `hash-${index + 1}`,
        active: index % 2 === 0,
    }));
}
//# sourceMappingURL=fixture.js.map