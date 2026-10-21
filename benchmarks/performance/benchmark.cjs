'use strict';

require('reflect-metadata');

const { performance } = require('node:perf_hooks');
const { once } = require('node:events');
const express = require('express');
const { Controller, Get, Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DataSource, Entity, PrimaryGeneratedColumn, Column } = require('typeorm');
const { assertValue, protectValue, protectOptimizedImmutableValue } = require('../../system/base/dist');
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
const PUBLIC_SELECT = Object.freeze({
  id: true,
  name: true,
  email: true,
  isActive: true,
  department: true,
});
const PUBLIC_QUERY_COLUMNS = Object.freeze([
  'user.id',
  'user.name',
  'user.email',
  'user.isActive',
  'user.department',
]);

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

/**
 * Low-overhead comparison path: remove the secret from each hydrated entity
 * inside map and return the same references. This is intentionally
 * benchmark-only because it mutates entities and does not install runtime
 * protection for the deleted property.
 */
function removePasswordHashInPlace(users) {
  return users.map((user) => {
    delete user.passwordHash;
    return user;
  });
}

function assertPublicResponse(response, expectedCount) {
  if (response.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} users, received ${response.length}`);
  }
  for (const user of response) {
    if (Object.prototype.hasOwnProperty.call(user, 'passwordHash')) {
      throw new Error('Public response still contains passwordHash');
    }
  }
  return response;
}

function toPublicPojos(users) {
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    department: user.department,
  }));
}

async function findDeleteValidateAndSerialize(userCount) {
  const entities = await repository.find({ order: { id: 'ASC' }, take: userCount });
  const response = removePasswordHashInPlace(entities);
  assertPublicResponse(response, userCount);
  assertValue(RESPONSE_ARRAY_SCHEMA, response, CONTEXT);
  return JSON.stringify(response);
}

async function findPublicSelectValidateAndSerialize(userCount) {
  const selected = await repository.find({
    select: PUBLIC_SELECT,
    order: { id: 'ASC' },
    take: userCount,
  });
  const response = toPublicPojos(selected);
  assertPublicResponse(response, userCount);
  assertValue(RESPONSE_ARRAY_SCHEMA, response, CONTEXT);
  return JSON.stringify(response);
}

async function queryBuilderPublicSelectValidateAndSerialize(userCount) {
  const response = await repository
    .createQueryBuilder('user')
    .select(PUBLIC_QUERY_COLUMNS)
    .orderBy('user.id', 'ASC')
    .take(userCount)
    .getMany();
  assertPublicResponse(response, userCount);
  assertValue(RESPONSE_ARRAY_SCHEMA, response, CONTEXT);
  return JSON.stringify(response);
}

async function findPublicSelectBaselineAndSerialize(userCount) {
  const selected = await repository.find({
    select: PUBLIC_SELECT,
    order: { id: 'ASC' },
    take: userCount,
  });
  const response = toPublicPojos(selected);
  assertPublicResponse(response, userCount);
  return JSON.stringify(response);
}

async function findPublicSelectProtectedAndSerialize(userCount, protector) {
  const selected = await repository.find({
    select: PUBLIC_SELECT,
    order: { id: 'ASC' },
    take: userCount,
  });
  const response = toPublicPojos(selected);
  assertPublicResponse(response, userCount);
  return JSON.stringify(protector(RESPONSE_ARRAY_SCHEMA, response, CONTEXT));
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

async function validateResponse(url, expectedUserCount) {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`Expected HTTP 200 from ${url}, received ${response.status}`);
  }
  const users = await response.json();
  if (!Array.isArray(users) || users.length !== expectedUserCount || Object.hasOwn(users[0], 'passwordHash')) {
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

async function measureHttp(name, url, expectedUserCount) {
  await validateResponse(url, expectedUserCount);
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

function createExpressApp(mode, userCount) {
  const application = express();
  application.get('/users', async (_request, response, next) => {
    try {
      const entities = await repository.find({ order: { id: 'ASC' }, take: userCount });
      if (mode !== 'baseline') {
        assertValue(ENTITY_ARRAY_SCHEMA, entities, CONTEXT);
      }
      const users = projectWithoutPassword(entities);
      const output = mode === 'guarded'
        ? protectValue(RESPONSE_ARRAY_SCHEMA, users, CONTEXT)
        : mode === 'optimizedImmutable'
          ? protectOptimizedImmutableValue(RESPONSE_ARRAY_SCHEMA, users, CONTEXT)
          : users;
      response.json(output);
    } catch (error) {
      next(error);
    }
  });
  return application;
}

function createNestModule(mode, userCount) {
  class BenchmarkController {
    async list() {
      const entities = await repository.find({ order: { id: 'ASC' }, take: userCount });
      if (mode !== 'baseline') {
        assertValue(ENTITY_ARRAY_SCHEMA, entities, CONTEXT);
      }
      const users = projectWithoutPassword(entities);
      return mode === 'guarded'
        ? protectValue(RESPONSE_ARRAY_SCHEMA, users, CONTEXT)
        : mode === 'optimizedImmutable'
          ? protectOptimizedImmutableValue(RESPONSE_ARRAY_SCHEMA, users, CONTEXT)
          : users;
    }
  }
  Controller('users')(BenchmarkController);
  Get()(BenchmarkController.prototype, 'list', Object.getOwnPropertyDescriptor(BenchmarkController.prototype, 'list'));
  class BenchmarkModule {}
  Module({ controllers: [BenchmarkController] })(BenchmarkModule);
  return BenchmarkModule;
}

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

async function measureExpressScenario(mode, userCount) {
  const listener = await listenExpress(createExpressApp(mode, userCount));
  try {
    return await measureHttp(`Express ${mode} (${userCount} users)`, listener.url, userCount);
  } finally {
    await new Promise((resolve) => listener.server.close(resolve));
  }
}

async function measureNestScenario(mode, userCount) {
  const application = await NestFactory.create(createNestModule(mode, userCount), { logger: false });
  if (mode !== 'baseline') {
    application.useGlobalFilters(new StrictTypeErrorFilter());
  }
  try {
    return await measureHttp(
      `Nest ${mode} (${userCount} users)`,
      await listenNest(application),
      userCount,
    );
  } finally {
    await application.close();
  }
}

async function measureRuntimeBatches(hydratedUsers, projectedUsers, batchSizes) {
  const batches = {};
  for (const userCount of batchSizes) {
    batches[String(userCount)] = Object.freeze({
      validation: await measureAsync(`assertValue(UserResponse[${userCount}])`, async () =>
        assertValue(RESPONSE_ARRAY_SCHEMA, projectedUsers.slice(0, userCount), CONTEXT)),
      guarded: await measureAsync(`project + protectValue(UserResponse[${userCount}])`, async () =>
        protectValue(RESPONSE_ARRAY_SCHEMA, projectWithoutPassword(hydratedUsers.slice(0, userCount)), CONTEXT)),
      optimizedImmutable: await measureAsync(`project + protectOptimizedImmutableValue(UserResponse[${userCount}])`, async () =>
        protectOptimizedImmutableValue(RESPONSE_ARRAY_SCHEMA, projectWithoutPassword(hydratedUsers.slice(0, userCount)), CONTEXT)),
    });
  }
  return Object.freeze(batches);
}

async function measurePipelineStages(hydratedUsers, batchSizes) {
  const stages = {};
  for (const userCount of batchSizes) {
    const users = hydratedUsers.slice(0, userCount);
    const baselineResponse = projectWithoutPassword(users);
    const guardedResponse = protectValue(RESPONSE_ARRAY_SCHEMA, projectWithoutPassword(users), CONTEXT);

    stages[String(userCount)] = Object.freeze({
      typeormFindHydration: await measureAsync(
        `TypeORM find + hydration (${userCount})`,
        async () => repository.find({ order: { id: 'ASC' }, take: userCount }),
      ),
      typeormFindHydrationAndDelete: await measureAsync(
        `TypeORM find + hydration + delete passwordHash (${userCount})`,
        async () => removePasswordHashInPlace(
          await repository.find({ order: { id: 'ASC' }, take: userCount }),
        ),
      ),
      typeormFindPublicSelect: await measureAsync(
        `TypeORM find with public select (${userCount})`,
        async () => repository.find({
          select: PUBLIC_SELECT,
          order: { id: 'ASC' },
          take: userCount,
        }),
      ),
      typeormQueryBuilderPublicSelect: await measureAsync(
        `TypeORM QueryBuilder public select (${userCount})`,
        async () => repository
          .createQueryBuilder('user')
          .select(PUBLIC_QUERY_COLUMNS)
          .orderBy('user.id', 'ASC')
          .take(userCount)
          .getMany(),
      ),
      findDeleteValidateAndSerialize: await measureAsync(
        `find + delete + validate + JSON.stringify (${userCount})`,
        async () => findDeleteValidateAndSerialize(userCount),
      ),
      findPublicSelectValidateAndSerialize: await measureAsync(
        `public select + validate + JSON.stringify (${userCount})`,
        async () => findPublicSelectValidateAndSerialize(userCount),
      ),
      queryBuilderPublicSelectValidateAndSerialize: await measureAsync(
        `QueryBuilder public select + validate + JSON.stringify (${userCount})`,
        async () => queryBuilderPublicSelectValidateAndSerialize(userCount),
      ),
      publicSelectBaseline: await measureAsync(
        `public select baseline without ts-typed (${userCount})`,
        async () => findPublicSelectBaselineAndSerialize(userCount),
      ),
      publicSelectOptimizedImmutable: await measureAsync(
        `public select + TTOptImmut + JSON.stringify (${userCount})`,
        async () => findPublicSelectProtectedAndSerialize(userCount, protectOptimizedImmutableValue),
      ),
      publicSelectMutableProtection: await measureAsync(
        `public select + protectValue + JSON.stringify (${userCount})`,
        async () => findPublicSelectProtectedAndSerialize(userCount, protectValue),
      ),
      entityValidation: await measureAsync(
        `entity validation (${userCount})`,
        async () => assertValue(ENTITY_ARRAY_SCHEMA, users, CONTEXT),
      ),
      projection: await measureAsync(
        `password projection (${userCount})`,
        async () => projectWithoutPassword(users),
      ),
      responseValidation: await measureAsync(
        `response validation (${userCount})`,
        async () => assertValue(RESPONSE_ARRAY_SCHEMA, baselineResponse, CONTEXT),
      ),
      responseProtection: await measureAsync(
        `response protection (${userCount})`,
        async () => protectValue(RESPONSE_ARRAY_SCHEMA, projectWithoutPassword(users), CONTEXT),
      ),
      jsonSerializationBaseline: await measureAsync(
        `JSON serialization baseline (${userCount})`,
        async () => JSON.stringify(baselineResponse),
      ),
      jsonSerializationGuarded: await measureAsync(
        `JSON serialization guarded (${userCount})`,
        async () => JSON.stringify(guardedResponse),
      ),
    });
  }
  return Object.freeze(stages);
}

async function measureHttpBatches(batchSizes) {
  const batches = {};
  for (const userCount of batchSizes) {
    batches[String(userCount)] = Object.freeze({
      express: Object.freeze({
        baseline: await measureExpressScenario('baseline', userCount),
        guarded: await measureExpressScenario('guarded', userCount),
        optimizedImmutable: await measureExpressScenario('optimizedImmutable', userCount),
      }),
      nest: Object.freeze({
        baseline: await measureNestScenario('baseline', userCount),
        guarded: await measureNestScenario('guarded', userCount),
        optimizedImmutable: await measureNestScenario('optimizedImmutable', userCount),
      }),
    });
  }
  return Object.freeze(batches);
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
  const batchSizes = Object.freeze([1, 50, USER_COUNT]);
  const runtime = Object.freeze({
    primitive: measureSync('assertValue(string)', 5_000_000, () => assertValue(STRING, 'ada@example.com', CONTEXT)),
    responseObject: measureSync('assertValue(UserResponse)', 1_000_000, () => assertValue(USER_RESPONSE_SCHEMA, projectedUsers[0], CONTEXT)),
    responseArray100: measureSync('assertValue(UserResponse[100])', 20_000, () => assertValue(RESPONSE_ARRAY_SCHEMA, projectedUsers.slice(0, 100), CONTEXT)),
    entityValidation10k: await measureAsync('assertValue(UserEntity[10,000])', async () => assertValue(ENTITY_ARRAY_SCHEMA, hydratedUsers, CONTEXT)),
    batches: await measureRuntimeBatches(hydratedUsers, projectedUsers, batchSizes),
    pipeline: await measurePipelineStages(hydratedUsers, batchSizes),
  });

  try {
    const http = await measureHttpBatches(batchSizes);
    console.log(JSON.stringify(Object.freeze({
      node: process.version,
      methodology: Object.freeze({ userCounts: batchSizes, httpRequestsPerSample: HTTP_REQUEST_COUNT, httpConcurrency: HTTP_CONCURRENCY, database: 'TypeORM + better-sqlite3 in-memory' }),
      verification: Object.freeze({ entitiesAreInstances: hydratedUsers.every((user) => user instanceof BenchmarkUserEntity), passwordHashRemoved: !Object.hasOwn(projectWithoutPassword([hydratedUsers[0]])[0], 'passwordHash') }),
      runtime: Object.fromEntries(Object.entries(runtime).map(([key, value]) => [key, stripInternal(value)])),
      http,
    }), null, 2));
  } finally {
    await dataSource.destroy();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
