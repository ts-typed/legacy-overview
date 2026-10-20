"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApplication = createApplication;
const express_1 = __importDefault(require("express"));
const fixture_1 = require("./fixture");
const contracts_1 = require("./contracts");
const defaultCount = 50;
const port = Number(process.env.PORT ?? 0);
const userPool = (0, fixture_1.createUsers)(10_000);
function parseCount(request) {
    const raw = request.query.count;
    const value = typeof raw === 'string' ? Number(raw) : defaultCount;
    if (!Number.isInteger(value) || value < 1 || value > userPool.length) {
        return defaultCount;
    }
    return value;
}
function createApplication() {
    const application = (0, express_1.default)();
    application.get('/users', (request, response) => {
        const users = (0, contracts_1.toResponses)(userPool.slice(0, parseCount(request)));
        response.json(users);
    });
    application.get('/summary', (request, response) => {
        const users = (0, contracts_1.toResponses)(userPool.slice(0, parseCount(request)));
        response.json((0, contracts_1.summarize)(users));
    });
    application.get('/users-optimized', (request, response) => {
        const users = (0, contracts_1.toOptimizedResponses)(userPool.slice(0, parseCount(request)));
        response.json(users);
    });
    return application;
}
if (require.main === module) {
    const server = createApplication().listen(port, '127.0.0.1');
    server.once('listening', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('Express server did not expose a TCP address');
        }
        process.stdout.write(`READY ${address.port}\n`);
    });
    const close = () => {
        server.close(() => process.exit(0));
    };
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
}
//# sourceMappingURL=server.js.map