import {
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
} from '@mui/material';
import EmptyState from './EmptyState';

export default function DataTable({
  columns = [],
  rows = [],
  getRowId = (row) => row._id,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription,
  pagination,
  onRowClick,
  'aria-label': ariaLabel = 'Data table',
}) {
  const hasRows = rows.length > 0;

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {loading && <LinearProgress />}
      <TableContainer>
        <Table aria-label={ariaLabel}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.key} align={column.align}>{column.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={getRowId(row, index)}
                hover={Boolean(onRowClick)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} align={column.align}>
                    {column.render ? column.render(row, index) : row[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!loading && !hasRows && (
              <TableRow>
                <TableCell colSpan={Math.max(columns.length, 1)} sx={{ p: 0 }}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {pagination && (
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page}
          onPageChange={pagination.onPageChange}
          rowsPerPage={pagination.rowsPerPage}
          onRowsPerPageChange={pagination.onRowsPerPageChange}
          rowsPerPageOptions={pagination.rowsPerPageOptions || [10, 20, 50]}
        />
      )}
    </Paper>
  );
}
