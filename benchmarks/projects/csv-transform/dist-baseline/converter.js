"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertCsv = convertCsv;
exports.createCsv = createCsv;
const validators_1 = require("@ts-typed/validators");
function parseRow(columns) {
    if (columns.length !== 5)
        throw new TypeError('CSV row must contain five columns');
    return {
        id: Number(columns[0]),
        name: columns[1],
        email: columns[2],
        passwordHash: columns[3],
        active: columns[4] === 'true',
    };
}
function convertCsv(input) {
    const lines = input.trim().split(/\r?\n/);
    const rows = [];
    let rejected = 0;
    for (const line of lines.slice(1)) {
        if (line.length === 0)
            continue;
        try {
            const raw = parseRow(line.split(','));
            const email = new validators_1.Email(raw.email).toString();
            rows.push({ id: raw.id, name: raw.name, email, active: raw.active });
        }
        catch (error) {
            if (!(error instanceof TypeError))
                throw error;
            rejected += 1;
        }
    }
    return { rows, rejected };
}
function createCsv(count, invalidEvery) {
    const lines = ['id,name,email,passwordHash,active'];
    for (let index = 1; index <= count; index += 1) {
        const email = invalidEvery > 0 && index % invalidEvery === 0 ? 'invalid-email' : `user-${index}@example.com`;
        lines.push(`${index},User ${index},${email},hash-${index},${index % 2 === 0}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=converter.js.map