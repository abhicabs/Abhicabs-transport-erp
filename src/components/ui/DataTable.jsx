/**
 * DataTable — MUI <Table> inside a <Paper>. Same props as before:
 *   columns [{ key, header, render, sortable, className, wrap }], rows, rowKey,
 *   status (loading|error|success), error, onRetry, onRowClick,
 *   sortBy, sortDir, onSort, page, limit, total, totalPages, onPageChange,
 *   onLimitChange, emptyTitle, emptyDescription.
 *
 * serial (default true) prepends a "#" column that numbers rows. It is
 * pagination-aware — it continues across pages using page/limit — so page 2
 * of a 10-per-page list starts at 11, not 1. Pass serial={false} to hide it.
 */
import Paper from '@mui/material/Paper';
import TableContainer from '@mui/material/TableContainer';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableSortLabel from '@mui/material/TableSortLabel';
import { TableSkeleton } from './Skeleton';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import Pagination from './Pagination';

const align = (col) => (col.className?.includes('text-right') ? 'right' : 'left');

export default function DataTable({
  columns, rows, rowKey = 'id', status = 'success', error, onRetry,
  onRowClick, sortBy, sortDir, onSort,
  page, limit, total, totalPages, onPageChange, onLimitChange,
  emptyTitle = 'No records found', emptyDescription, serial = true,
}) {
  const shell = (content) => <Paper variant="outlined" sx={{ borderRadius: 0, overflow: 'hidden' }}>{content}</Paper>;

  // Where this page's numbering starts. Pagination-aware so serial numbers run
  // continuously across pages (page 2 at 10/page begins at 11), falling back to
  // a plain 1-based count for tables that don't paginate.
  const serialStart = serial && page && limit ? (page - 1) * limit : 0;

  if (status === 'loading') return shell(<TableSkeleton cols={columns.length + (serial ? 1 : 0)} />);
  if (status === 'error') return shell(<ErrorState message={error?.message} onRetry={onRetry} />);
  if (!rows?.length) return shell(<EmptyState title={emptyTitle} description={emptyDescription} />);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {shell(
        <TableContainer>
          <Table size="medium" sx={{ minWidth: 'max-content' }}>
            <TableHead>
              <TableRow>
                {serial && (
                  <TableCell align="left" sx={{ width: 48, whiteSpace: 'nowrap', color: 'text.secondary' }}>#</TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.key} align={align(col)} sortDirection={sortBy === col.key ? (sortDir || 'asc') : false}>
                    {col.sortable ? (
                      <TableSortLabel
                        active={sortBy === col.key}
                        direction={sortBy === col.key ? (sortDir || 'asc') : 'asc'}
                        onClick={() => onSort?.(col.key)}
                      >
                        {col.header}
                      </TableSortLabel>
                    ) : col.header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow
                  key={row[rowKey] ?? idx}
                  hover
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  sx={{ cursor: onRowClick ? 'pointer' : 'default', '&:last-of-type td': { borderBottom: 0 } }}
                >
                  {serial && (
                    <TableCell align="left" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {serialStart + idx + 1}
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell key={col.key} align={align(col)} sx={{ fontWeight: 500, whiteSpace: col.wrap ? 'normal' : 'nowrap' }}>
                      {col.render ? col.render(row) : row[col.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>,
      )}

      {onPageChange && (
        <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onChange={onPageChange} onLimitChange={onLimitChange} />
      )}
    </div>
  );
}
