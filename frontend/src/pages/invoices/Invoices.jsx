import { useCallback, useEffect, useState } from 'react';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import {
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { formatDateIST } from '../../utils/dates';
import { formatINR } from '../../utils/money';

const statuses = ['Draft', 'Confirmed', 'Paid', 'Cancelled'];

export default function Invoices() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '', overdue: false, payment: '', from: '', to: '' });
  const [query, setQuery] = useState(filters);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery({ ...filters, search: filters.search.trim() });
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/invoices', {
        params: {
          page: page + 1,
          limit,
          search: query.search || undefined,
          status: query.status || undefined,
          overdue: query.overdue ? 'true' : undefined,
          payment: query.payment || undefined,
          from: query.from || undefined,
          to: query.to || undefined,
        },
      });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load invoices'));
    } finally {
      setLoading(false);
    }
  }, [limit, page, query]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const columns = [
    {
      key: 'number',
      label: 'Invoice',
      render: (invoice) => (
        <Stack>
          <Typography sx={{ fontWeight: 600 }}>{invoice.number}</Typography>
          <Typography variant="caption" color="text.secondary">{invoice.customerId?.name || 'Customer unavailable'}</Typography>
        </Stack>
      ),
    },
    { key: 'subscription', label: 'Subscription', render: (invoice) => invoice.subscriptionId?.number || '—' },
    { key: 'issueDate', label: 'Issued', render: (invoice) => formatDateIST(invoice.issueDate) },
    { key: 'dueDate', label: 'Due', render: (invoice) => formatDateIST(invoice.dueDate) },
    { key: 'total', label: 'Total', align: 'right', render: (invoice) => formatINR(invoice.total) },
    { key: 'outstanding', label: 'Outstanding', align: 'right', render: (invoice) => formatINR(invoice.outstanding) },
    {
      key: 'status',
      label: 'Status',
      render: (invoice) => <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><StatusChip status={invoice.status} />{invoice.isOverdue && <StatusChip status="Overdue" />}</Stack>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (invoice) => (
        <Tooltip title="Open invoice">
          <IconButton component={Link} to={`/invoices/${invoice._id}`} aria-label={`Open ${invoice.number}`}><OpenInNewOutlined /></IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Invoices" subtitle="Review billing periods, balances, and invoice status." />
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField size="small" label="Search invoice or customer" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} sx={{ minWidth: { sm: 250 } }} />
          <TextField select size="small" label="Status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All statuses</MenuItem>
            {statuses.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Payment" value={filters.payment} onChange={(event) => updateFilter('payment', event.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">Paid and outstanding</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="outstanding">Outstanding</MenuItem>
          </TextField>
          <TextField select size="small" label="Overdue" value={filters.overdue ? 'true' : 'false'} onChange={(event) => updateFilter('overdue', event.target.value === 'true')} sx={{ minWidth: 130 }}>
            <MenuItem value="false">All invoices</MenuItem>
            <MenuItem value="true">Overdue only</MenuItem>
          </TextField>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField size="small" type="date" label="Issued from" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Issued to" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
      </Stack>
      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        emptyTitle="No invoices found"
        emptyDescription="Invoices generated from active subscriptions will appear here."
        aria-label="Invoices"
        pagination={{
          total,
          page,
          rowsPerPage: limit,
          onPageChange: (_event, nextPage) => setPage(nextPage),
          onRowsPerPageChange: (event) => { setLimit(Number(event.target.value)); setPage(0); },
        }}
      />
    </>
  );
}
