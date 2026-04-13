import { describe, it, expect } from 'vitest';
import { DataTransformer } from '../server/services/data-transformer';

const transformer = new DataTransformer();

describe('DataTransformer.getNestedValue (via transformResponse)', () => {
  const makeEndpoint = (mappings: Record<string, { sourcePath: string; transform?: string; defaultValue?: string }>) => ({
    url: 'https://example.com',
    method: 'GET' as const,
    fieldMappings: mappings,
    headers: {},
    paginationType: 'none' as const,
  });

  it('extracts top-level fields', () => {
    const result = transformer.transformResponse(
      [{ name: 'Alice', email: 'alice@test.com' }],
      makeEndpoint({
        firstName: { sourcePath: 'name' },
        email: { sourcePath: 'email' },
      })
    );
    expect(result.data[0]).toEqual({ firstName: 'Alice', email: 'alice@test.com' });
    expect(result.errors).toHaveLength(0);
  });

  it('extracts nested fields with dot notation', () => {
    const result = transformer.transformResponse(
      [{ person: { name: { first: 'Bob', last: 'Smith' } } }],
      makeEndpoint({
        firstName: { sourcePath: 'person.name.first' },
        lastName: { sourcePath: 'person.name.last' },
      })
    );
    expect(result.data[0]).toEqual({ firstName: 'Bob', lastName: 'Smith' });
  });

  it('extracts array elements with bracket notation', () => {
    const result = transformer.transformResponse(
      [{ tags: ['vip', 'speaker', 'sponsor'] }],
      makeEndpoint({
        primaryTag: { sourcePath: 'tags[0]' },
        secondTag: { sourcePath: 'tags[1]' },
      })
    );
    expect(result.data[0]).toEqual({ primaryTag: 'vip', secondTag: 'speaker' });
  });

  it('concatenates paths with + operator', () => {
    const result = transformer.transformResponse(
      [{ first: 'Jane', last: 'Doe' }],
      makeEndpoint({
        fullName: { sourcePath: 'first + last' },
      })
    );
    expect(result.data[0]).toEqual({ fullName: 'Jane Doe' });
  });

  it('returns defaultValue when source is missing', () => {
    const result = transformer.transformResponse(
      [{ name: 'Test' }],
      makeEndpoint({
        name: { sourcePath: 'name' },
        company: { sourcePath: 'organization', defaultValue: 'N/A' },
      })
    );
    expect(result.data[0]).toEqual({ name: 'Test', company: 'N/A' });
  });

  it('handles missing nested path gracefully', () => {
    const result = transformer.transformResponse(
      [{ a: {} }],
      makeEndpoint({
        value: { sourcePath: 'a.b.c.d', defaultValue: 'fallback' },
      })
    );
    expect(result.data[0]).toEqual({ value: 'fallback' });
  });
});

describe('DataTransformer.applyTransform (via transformResponse)', () => {
  const makeEndpoint = (mappings: Record<string, { sourcePath: string; transform?: string; defaultValue?: string }>) => ({
    url: 'https://example.com',
    method: 'GET' as const,
    fieldMappings: mappings,
    headers: {},
    paginationType: 'none' as const,
  });

  it('applies lowercase transform', () => {
    const result = transformer.transformResponse(
      [{ email: 'ALICE@TEST.COM' }],
      makeEndpoint({ email: { sourcePath: 'email', transform: 'lowercase' } })
    );
    expect(result.data[0]).toEqual({ email: 'alice@test.com' });
  });

  it('applies uppercase transform', () => {
    const result = transformer.transformResponse(
      [{ code: 'abc123' }],
      makeEndpoint({ code: { sourcePath: 'code', transform: 'uppercase' } })
    );
    expect(result.data[0]).toEqual({ code: 'ABC123' });
  });

  it('applies trim transform', () => {
    const result = transformer.transformResponse(
      [{ name: '  Alice  ' }],
      makeEndpoint({ name: { sourcePath: 'name', transform: 'trim' } })
    );
    expect(result.data[0]).toEqual({ name: 'Alice' });
  });

  it('applies boolean transform from string', () => {
    const result = transformer.transformResponse(
      [{ active: 'yes', deleted: 'no' }],
      makeEndpoint({
        active: { sourcePath: 'active', transform: 'boolean' },
        deleted: { sourcePath: 'deleted', transform: 'boolean' },
      })
    );
    expect(result.data[0]).toEqual({ active: true, deleted: false });
  });

  it('applies number transform', () => {
    const result = transformer.transformResponse(
      [{ count: '42', bad: 'abc' }],
      makeEndpoint({
        count: { sourcePath: 'count', transform: 'number' },
        bad: { sourcePath: 'bad', transform: 'number', defaultValue: '0' },
      })
    );
    expect(result.data[0]).toEqual({ count: 42, bad: '0' });
  });

  it('applies date transform to valid ISO string', () => {
    const result = transformer.transformResponse(
      [{ date: '2025-06-15T10:30:00Z' }],
      makeEndpoint({ date: { sourcePath: 'date', transform: 'date' } })
    );
    expect(result.data[0]?.date).toBe('2025-06-15T10:30:00.000Z');
  });

  it('applies default: transform as fallback', () => {
    const result = transformer.transformResponse(
      [{ name: null }],
      makeEndpoint({ name: { sourcePath: 'name', transform: 'default:Unknown' } })
    );
    expect(result.data[0]).toEqual({ name: 'Unknown' });
  });

  it('applies json transform to stringified JSON', () => {
    const result = transformer.transformResponse(
      [{ meta: '{"key":"value"}' }],
      makeEndpoint({ meta: { sourcePath: 'meta', transform: 'json' } })
    );
    expect(result.data[0]).toEqual({ meta: { key: 'value' } });
  });
});

describe('DataTransformer.extractArray', () => {
  const makeEndpoint = (mappings: Record<string, { sourcePath: string }>) => ({
    url: 'https://example.com',
    method: 'GET' as const,
    fieldMappings: mappings,
    headers: {},
    paginationType: 'none' as const,
  });

  it('auto-discovers arrays under common keys', () => {
    const result = transformer.transformResponse(
      { data: [{ id: '1' }, { id: '2' }] },
      makeEndpoint({ id: { sourcePath: 'id' } })
    );
    expect(result.data).toHaveLength(2);
  });

  it('auto-discovers "results" key', () => {
    const result = transformer.transformResponse(
      { results: [{ id: 'a' }] },
      makeEndpoint({ id: { sourcePath: 'id' } })
    );
    expect(result.data).toHaveLength(1);
  });

  it('accepts raw array responses', () => {
    const result = transformer.transformResponse(
      [{ id: 'x' }],
      makeEndpoint({ id: { sourcePath: 'id' } })
    );
    expect(result.data).toHaveLength(1);
  });

  it('uses custom arrayPath', () => {
    const result = transformer.transformResponse(
      { response: { nested: { items: [{ id: 'deep' }] } } },
      makeEndpoint({ id: { sourcePath: 'id' } }),
      { arrayPath: 'response.nested.items' }
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({ id: 'deep' });
  });

  it('returns empty array for non-array responses', () => {
    const result = transformer.transformResponse(
      { message: 'not an array' },
      makeEndpoint({ id: { sourcePath: 'id' } })
    );
    expect(result.data).toHaveLength(0);
  });
});
