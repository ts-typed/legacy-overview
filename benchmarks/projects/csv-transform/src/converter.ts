import { Email } from '@ts-typed/validators';

export interface CsvRow {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly active: boolean;
}

export interface PublicRow {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly active: boolean;
}

export interface ConversionResult {
  readonly rows: readonly PublicRow[];
  readonly rejected: number;
}

function parseRow(columns: readonly string[]): CsvRow {
  if (columns.length !== 5) throw new TypeError('CSV row must contain five columns');
  return {
    id: Number(columns[0]),
    name: columns[1],
    email: columns[2],
    passwordHash: columns[3],
    active: columns[4] === 'true',
  };
}

export function convertCsv(input: string): ConversionResult {
  const lines = input.trim().split(/\r?\n/);
  const rows: PublicRow[] = [];
  let rejected = 0;
  for (const line of lines.slice(1)) {
    if (line.length === 0) continue;
    try {
      const raw = parseRow(line.split(','));
      const email = new Email(raw.email).toString();
      rows.push({ id: raw.id, name: raw.name, email, active: raw.active });
    } catch (error: unknown) {
      if (!(error instanceof TypeError)) throw error;
      rejected += 1;
    }
  }
  return { rows, rejected };
}

export function createCsv(count: number, invalidEvery: number): string {
  const lines = ['id,name,email,passwordHash,active'];
  for (let index = 1; index <= count; index += 1) {
    const email = invalidEvery > 0 && index % invalidEvery === 0 ? 'invalid-email' : `user-${index}@example.com`;
    lines.push(`${index},User ${index},${email},hash-${index},${index % 2 === 0}`);
  }
  return lines.join('\n');
}
