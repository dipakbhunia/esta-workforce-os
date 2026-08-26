export function serializeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') return value.toString(10) as T;
  if (Array.isArray(value)) return value.map((item) => serializeBigInts(item)) as T;
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)])) as T;
}
