import { describe, it, expect } from 'vitest';
import { safeTransform } from '../client/src/lib/safe-transform';

describe('safeTransform', () => {
  describe('pick', () => {
    it('extracts a nested value', () => {
      const data = { response: { body: { items: [1, 2, 3] } } };
      expect(safeTransform(data, 'pick("response.body.items")')).toEqual([1, 2, 3]);
    });

    it('returns undefined for missing path', () => {
      expect(safeTransform({ a: 1 }, 'pick("b.c")')).toBeUndefined();
    });
  });

  describe('unwrap', () => {
    it('extracts a nested value like pick', () => {
      const data = { data: { users: ['alice'] } };
      expect(safeTransform(data, 'unwrap("data.users")')).toEqual(['alice']);
    });
  });

  describe('wrap', () => {
    it('wraps data under a key', () => {
      expect(safeTransform([1, 2], 'wrap("items")')).toEqual({ items: [1, 2] });
    });
  });

  describe('rename', () => {
    it('renames keys on an object', () => {
      const data = { firstName: 'Alice', lastName: 'Smith' };
      const result = safeTransform(data, 'rename({ "firstName": "first", "lastName": "last" })');
      expect(result).toEqual({ first: 'Alice', last: 'Smith' });
    });

    it('renames keys across an array of objects', () => {
      const data = [{ name: 'A' }, { name: 'B' }];
      const result = safeTransform(data, 'rename({ "name": "label" })');
      expect(result).toEqual([{ label: 'A' }, { label: 'B' }]);
    });
  });

  describe('map', () => {
    it('maps array items to new field names', () => {
      const data = {
        attendees: [
          { fullName: 'Alice', emailAddress: 'alice@test.com' },
          { fullName: 'Bob', emailAddress: 'bob@test.com' },
        ]
      };
      const result = safeTransform(data, 'map("attendees", { "name": "fullName", "email": "emailAddress" })');
      expect(result).toEqual([
        { name: 'Alice', email: 'alice@test.com' },
        { name: 'Bob', email: 'bob@test.com' },
      ]);
    });

    it('returns original data when source is not an array', () => {
      const data = { attendees: 'not-an-array' };
      const result = safeTransform(data, 'map("attendees", { "name": "fullName" })');
      expect(result).toEqual(data);
    });
  });

  describe('pipeline (multiple operations)', () => {
    it('chains pick then rename', () => {
      const data = { response: { users: [{ firstName: 'A' }] } };
      const result = safeTransform(data, 'pick("response.users") | rename({ "firstName": "name" })');
      expect(result).toEqual([{ name: 'A' }]);
    });

    it('chains pick then wrap', () => {
      const data = { items: [1, 2, 3] };
      const result = safeTransform(data, 'pick("items") | wrap("data")');
      expect(result).toEqual({ data: [1, 2, 3] });
    });
  });

  describe('edge cases', () => {
    it('returns original data for empty expression', () => {
      expect(safeTransform({ a: 1 }, '')).toEqual({ a: 1 });
    });

    it('returns original data for whitespace-only expression', () => {
      expect(safeTransform({ a: 1 }, '   ')).toEqual({ a: 1 });
    });

    it('returns original data for unrecognized expression', () => {
      expect(safeTransform({ a: 1 }, 'nonsense()')).toEqual({ a: 1 });
    });
  });
});
