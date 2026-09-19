import { expect, it } from 'vitest';
import { datasetRows, datasetLocalDay, validDatasetFilters, type DatasetFilterGroup } from '../src/dataset-query';
const records = [{ Name: 'Alpha', Cost: 10, Status: 'Open' }, { Name: 'Beta', Cost: 10, Status: 'Done' }, { Name: 'Gamma', Cost: 20, Status: 'Open' }];
it('combines nested groups, sorts by each key, preserves source indexes and raw data', () => {
  const before = structuredClone(records);
  const filters: DatasetFilterGroup = { mode: 'and', rules: [{ id: 'cost', field: 'Cost', operator: 'gte', value: 10 }, { mode: 'or', rules: [{ id: 'status', field: 'Status', operator: 'equals', value: 'Done' }, { id: 'name', field: 'Name', operator: 'contains', value: 'ALP' }] }] };
  expect(datasetRows(records, { filters, sorts: [{ field: 'Cost', direction: 'asc' }, { field: 'Name', direction: 'desc' }] }).map(row => row.index)).toEqual([1, 0]);
  expect(records).toEqual(before);
  expect(datasetRows(records, { where: 'Status', equals: 'missing', sortBy: 'Name', sortDir: 'desc', filters: { mode: 'or', rules: [] }, sorts: [] }).map(row => row.index)).toEqual([0, 1, 2]);
});
it('validates calendar days without UTC conversion and rejects malformed query writes', () => {
  expect(datasetLocalDay('2024-02-29T23:00:00-09:00')).toBe('2024-02-29');
  expect(datasetLocalDay('2025-02-29')).toBe(''); expect(datasetLocalDay('2026-04-31')).toBe('');
  expect(validDatasetFilters({ mode: 'and', rules: [{ id: 'x', field: 'Cost', operator: 'gt', value: 'abc' }] }, ['Cost'])).toBe(false);
  expect(datasetRows([{ date: '2026-09-07T23:00:00-09:00' }, { date: '' }], { filters: { mode: 'and', rules: [{ id: 'd', field: 'date', operator: 'on', value: '2026-09-07' }] } }).map(row => row.index)).toEqual([0]);
});
