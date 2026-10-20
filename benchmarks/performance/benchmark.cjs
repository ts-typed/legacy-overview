'use strict';

require('reflect-metadata');

const { performance } = require('node:perf_hooks');
const { once } = require('node:events');
const express = require('express');
const { Controller, Get, Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DataSource, Entity, PrimaryGeneratedColumn, Column } = require('typeorm');
const { assertValue, protectValue } = require('@ts-typed/compiler');
const { StrictTypeErrorFilter } = require('@ts-typed/nestjs');

const USER_COUNT = 10_000;
const INSERT_BATCH_SIZE = 100;
const WARMUP_COUNT = 2;
const SAMPLE_COUNT = 7;
const HTTP_REQUEST_COUNT = 20;
const HTTP_CONCURRENCY = 4;
const CONTEXT = Object.freeze({ contractKind: 'return', operation: 'return', propertyPath: 'UserService.list' });
const STRING = Object.freeze({ kind: 'primitive', name: 'string' });
const NUMBER = Object.freeze({ kind: 'primitive', name: 'number' });
const BOOLEAN = Object.freeze({ kind: 'primitive', name: 'boolean' });
const USER_ENTITY_SCHEMA = Object.freeze({
  kind: 'object',
  properties: Object.freeze({
    id: Object.freeze({ schema: NUMBER }),
    name: Object.freeze({ schema: STRING }),
    email: Object.freeze({ schema: STRING }),
    passwordHash: Object.freeze({ schema: STRING }),
    isActive: Object.freeze({ schema: BOOLEAN }),
    department: Object.freeze({ schema: STRING }),
  }),
});
const USER_RESPONSE_SCHEMA = Object.freeze({
  kind: 'object',
  properties: Object.freeze({
    id: Object.freeze({ schema: NUMBER }),
    name: Object.freeze({ schema: STRING }),
    email: Object.freeze({ schema: STRING }),
    isActive: Object.freeze({ schema: BOOLEAN }),
    department: Object.freeze({ schema: STRING }),
  }),
});
const ENTITY_ARRAY_SCHEMA = Object.freeze({ kind: 'array', items: USER_ENTITY_SCHEMA });
const RESPONSE_ARRAY_SCHEMA = Object.freeze({ kind: 'array', items: USER_RESPONSE_SCHEMA });

class BenchmarkUserEntity {}
Entity({ name: 'benchmark_user' })(BenchmarkUserEntity);
PrimaryGeneratedColumn('increment')(BenchmarkUserEntity.prototype, 'id');
Column({ type: 'varchar' })(BenchmarkUserEntity.prototype, 'name');
Column({ type: 'varchar' })(BenchmarkUserEntity.prototype, 'email');
Column({ type: 'varchar' })(BenchmarkUserEntity.prototype, 'passwordHash');
Column({ type: 'boolean' })(BenchmarkUserEntity.prototype, 'isActive');
Column({ type: 'varchar' })(BenchmarkUserEntity.prototype, 'department');

let repository;

function projectWithoutPassword(users) {
  return users.map((user) => {
    const { passwordHash: _passwordHash, ...response } = user;
    return response;
  });
}

function createSeedRows() {
  return Array.from({ length: USER_COUNT }, (_, index) => ({
    name: `User ${index}`,
    email: `user-${index}@example.com`,
    passwordHash: `argon2id$fixture-${index}`,
    isActive: index % 2 === 0,
    department: index % 3 === 0 ? 'engineering' : 'operations',
  }));
}

async function seedUsers() {
  const rows = createSeedRows();
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    await repository.insert(rows.slice(index, index + INSERT_BATCH_SIZE));
  }
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return Object.freeze({
    samples: sorted.length,
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    mean: sum / sorted.length,
    maximum: sorted[sorted.length - 1],
  });
}

async function measureAsync(name, operation) {
  for (let index = 0; index < WARMUP_COUNT; index += 1) {
    await operation();
  }
  const samples = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const startedAt = performance.now();
    await operation();
    samples.push(performance.now() - startedAt);
  }
  const statistics = summarize(samples);
  return Object.freeze({
    name,
    samples: statistics.samples,
    minimumMilliseconds: statistics.minimum,
    medianMilliseconds: statistics.median,
    meanMilliseconds: statistics.mean,
    maximumMilliseconds: statistics.maximum,
  });
}

function measureSync(name, iterations, operation) {
  for (let index = 0; index < Math.min(iterations, 10_000); index += 1) {
    operation();
  }
  const startedAt = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) {
    operation();
  }
  const elapsedNanoseconds = Number(process.hrtime.bigint() - startedAt);
  return Object.freeze({
    name,
    iterations,
    nanosecondsPerOperation: elapsedNanoseconds / iterations,
    operationsPerSecond: iterations / (elapsedNanoseconds / 1_000_000_000),
  });
}

function stripInternal(measurement) {
  return measurement;
}

async function validateResponse(url) {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`Expected HTTP 200 from ${url}, received ${response.status}`);
  }
  const users = await response.json();
  if (!Array.isArray(users) || users.length !== USER_COUNT || Object.hasOwn(users[0], 'passwordHash')) {
    throw new Error(`Invalid benchmark response from ${url}`);
  }
}

async function runHttpSample(url) {
  let nextRequest = 0;
  const startedAt = performance.now();
  const workers = Array.from({ length: HTTP_CONCURRENCY }, async () => {
    while (nextRequest < HTTP_REQUEST_COUNT) {
      nextRequest += 1;
      const response = await fetch(url);
      if (response.status !== 200) {
        throw new Error(`Expected HTTP 200 from ${url}, received ${response.status}`);
      }
      await response.arrayBuffer();
    }
  });
  await Promise.all(workers);
  const elapsedMilliseconds = performance.now() - startedAt;
  return HTTP_REQUEST_COUNT / (elapsedMilliseconds / 1_000);
}

async function measureHttp(name, url) {
  await validateResponse(url);
  await runHttpSample(url);
  const samples = [];
  for (let index = 0; index < 5; index += 1) {
    samples.push(await runHttpSample(url));
  }
  const throughput = summarize(samples);
  return Object.freeze({
    name,
    requestsPerSecond: throughput,
    estimatedMedianLatencyMilliseconds: (HTTP_CONCURRENCY / throughput.median) * 1_000,
    failedRequests: 0,
  });
}

function createExpressApp(isProtected) {
  const application = express();
  application.get('/users', async (_request, response, next) => {
    try {
      const entities = await repository.find({ order: { id: 'ASC' } });
      if (isProtected) {
        assertValue(ENTITY_ARRAY_SCHEMA, entities, CONTEXT);
      }
      const users = projectWithoutPassword(entities);
      const output = isProtected ? protectValue(RESPONSE_ARRAY_SCHEMA, users, CONTEXT) : users;
      response.json(output);
    } catch (error) {
      next(error);
    }
  });
  return application;
}

class NestBaselineController {
  async list() {
    return projectWithoutPassword(await repository.find({ order: { id: 'ASC' } }));
  }
}
Controller('users')(NestBaselineController);
Get()(NestBaselineController.prototype, 'list', Object.getOwnPropertyDescriptor(NestBaselineController.prototype, 'list'));

class NestProtectedController {
  async list() {
    const entities = await repository.find({ order: { id: 'ASC' } });
    assertValue(ENTITY_ARRAY_SCHEMA, entities, CONTEXT);
    return protectValue(RESPONSE_ARRAY_SCHEMA, projectWithoutPassword(entities), CONTEXT);
  }
}
Controller('users')(NestProtectedController);
Get()(NestProtectedController.prototype, 'list', Object.getOwnPropertyDescriptor(NestProtectedController.prototype, 'list'));

class NestBaselineModule {}
Module({ controllers: [NestBaselineController] })(NestBaselineModule);
class NestProtectedModule {}
Module({ controllers: [NestProtectedController] })(NestProtectedModule);

async function listenExpress(application) {
  const server = application.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not resolve Express benchmark address');
  }
  return Object.freeze({ server, url: `http://127.0.0.1:${address.port}/users` });
}

async function listenNest(application) {
  await application.listen(0, '127.0.0.1');
  return `http://127.0.0.1:${application.getHttpServer().address().port}/users`;
}

async function run() {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [BenchmarkUserEntity],
    synchronize: true,
    logging: false,
  });
  await dataSource.initialize();
  repository = dataSource.getRepository(BenchmarkUserEntity);
  await seedUsers();

  const hydratedUsers = await repository.find({ order: { id: 'ASC' } });
  const projectedUsers = projectWithoutPassword(hydratedUsers);
  const runtime = Object.freeze({
    primitive: measureSync('assertValue(string)', 5_000_000, () => assertValue(STRING, 'ada@example.com', CONTEXT)),
    responseObject: measureSync('assertValue(UserResponse)', 1_000_000, () => assertValue(USER_RESPONSE_SCHEMA, projectedUsers[0], CONTEXT)),
    responseArray100: measureSync('assertValue(UserResponse[100])', 20_000, () => assertValue(RESPONSE_ARRAY_SCHEMA, projectedUsers.slice(0, 100), CONTEXT)),
    responseArray10k: await measureAsync('assertValue(UserResponse[10,000])', async () => assertValue(RESPONSE_ARRAY_SCHEMA, projectedUsers, CONTEXT)),
    entityValidation10k: await measureAsync('assertValue(UserEntity[10,000])', async () => assertValue(ENTITY_ARRAY_SCHEMA, hydratedUsers, CONTEXT)),
    protection10k: await measureAsync('project + protectValue(UserResponse[10,000])', async () => protectValue(RESPONSE_ARRAY_SCHEMA, projectWithoutPassword(hydratedUsers), CONTEXT)),
  });

  const expressBaseline = await listenExpress(createExpressApp(false));
  const expressProtected = await listenExpress(createExpressApp(true));
  const nestBaseline = await NestFactory.create(NestBaselineModule, { logger: false });
  const nestProtected = await NestFactory.create(NestProtectedModule, { logger: false });
  nestProtected.useGlobalFilters(new StrictTypeErrorFilter());
  const nestBaselineUrl = await listenNest(nestBaseline);
  const nestProtectedUrl = await listenNest(nestProtected);

  try {
    const http = Object.freeze({
      expressBaseline: await measureHttp('Express: TypeORM + projection', expressBaseline.url),
      expressProtected: await measureHttp('Express: entity validation + response protection', expressProtected.url),
      nestBaseline: await measureHttp('Nest: TypeORM + projection', nestBaselineUrl),
      nestProtected: await measureHttp('Nest: entity validation + response protection + StrictTypeErrorFilter', nestProtectedUrl),
    });
    console.log(JSON.stringify(Object.freeze({
      node: process.version,
      methodology: Object.freeze({ userCount: USER_COUNT, httpRequestsPerSample: HTTP_REQUEST_COUNT, httpConcurrency: HTTP_CONCURRENCY, database: 'TypeORM + better-sqlite3 in-memory' }),
      verification: Object.freeze({ entitiesAreInstances: hydratedUsers.every((user) => user instanceof BenchmarkUserEntity), passwordHashRemoved: !Object.hasOwn(projectWithoutPassword([hydratedUsers[0]])[0], 'passwordHash') }),
      runtime: Object.fromEntries(Object.entries(runtime).map(([key, value]) => [key, stripInternal(value)])),
      http,
    }), null, 2));
  } finally {
    await Promise.all([new Promise((resolve) => expressBaseline.server.close(resolve)), new Promise((resolve) => expressProtected.server.close(resolve)), nestBaseline.close(), nestProtected.close()]);
    await dataSource.destroy();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
