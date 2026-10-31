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
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { formatDateTimeIST } from '../../utils/dates';
import { formatINR } from '../../utils/money';

const methods = ['cash', 'bank_transfer', 'card', 'upi', 'cheque'];

export default function Payments() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ method: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/payments', { params: { page: page + 1, limit, method: filters.method || undefined, from: filters.from || undefined, to: filters.to || undefined } });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load payments'));
    } finally {
      setLoading(false);
    }
  }, [filters, limit, page]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const updateFilter = (field, value) => { setFilters((current) => ({ ...current, [field]: value })); setPage(0); };
  const columns = [
    { key: 'date', label: 'Date', render: (payment) => formatDateTimeIST(payment.paymentDate) },
    { key: 'invoice', label: 'Invoice', render: (payment) => <Stack><Typography sx={{ fontWeight: 600 }}>{payment.invoiceId?.number || 'Invoice unavailable'}</Typography><Typography variant="caption" color="text.secondary">{payment.customerId?.name || 'Customer unavailable'}</Typography></Stack> },
    { key: 'method', label: 'Method', render: (payment) => <Typography sx={{ textTransform: 'capitalize' }}>{payment.method.replace('_', ' ')}</Typography> },
    { key: 'amount', label: 'Amount', align: 'right', render: (payment) => formatINR(payment.amount) },
    { key: 'recordedBy', label: 'Recorded by', render: (payment) => payment.recordedBy?.name || '—' },
    { key: 'actions', label: 'Actions', align: 'right', render: (payment) => payment.invoiceId?._id ? <Tooltip title="Open invoice"><IconButton component={Link} to={`/invoices/${payment.invoiceId._id}`} aria-label={`Open invoice ${payment.invoiceId.number}`}><OpenInNewOutlined /></IconButton></Tooltip> : '—' },
  ];

  return (
    <>
      <PageHeader title="Payments" subtitle="Track recorded payments across invoices." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Method" value={filters.method} onChange={(event) => updateFilter('method', event.target.value)} sx={{ minWidth: 170 }}><MenuItem value="">All methods</MenuItem>{methods.map((method) => <MenuItem key={method} value={method}>{method.replace('_', ' ')}</MenuItem>)}</TextField>
        <TextField size="small" type="date" label="Paid from" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Paid to" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>
      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
      <DataTable columns={columns} rows={items} loading={loading} emptyTitle="No payments found" emptyDescription="Recorded payments will appear here." aria-label="Payments" pagination={{ total, page, rowsPerPage: limit, onPageChange: (_event, nextPage) => setPage(nextPage), onRowsPerPageChange: (event) => { setLimit(Number(event.target.value)); setPage(0); } }} />
    </>
  );
}
