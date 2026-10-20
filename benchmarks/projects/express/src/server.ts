import express, { type Request, type Response } from 'express';
import { createUsers } from './fixture';
import { summarize, toOptimizedResponses, toResponses, type UserInput } from './contracts';

const defaultCount = 50;
const port = Number(process.env.PORT ?? 0);
const userPool: UserInput[] = createUsers(10_000);

function parseCount(request: Request): number {
  const raw = request.query.count;
  const value = typeof raw === 'string' ? Number(raw) : defaultCount;
  if (!Number.isInteger(value) || value < 1 || value > userPool.length) {
    return defaultCount;
  }
  return value;
}

export function createApplication(): express.Express {
  const application = express();
  application.get('/users', (request: Request, response: Response) => {
    const users = toResponses(userPool.slice(0, parseCount(request)));
    response.json(users);
  });
  application.get('/summary', (request: Request, response: Response) => {
    const users = toResponses(userPool.slice(0, parseCount(request)));
    response.json(summarize(users));
  });
  application.get('/users-optimized', (request: Request, response: Response) => {
    const users = toOptimizedResponses(userPool.slice(0, parseCount(request)));
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
  const close = (): void => {
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}
