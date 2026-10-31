import { useCallback, useEffect, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import {
  Button,
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
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { formatDateIST } from '../../utils/dates';

const statuses = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];

export default function Subscriptions() {
  const { user } = useAuth();
  const canManage = ['admin', 'staff'].includes(user.role);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '', customerId: '', planId: '', from: '', to: '', paused: '' });
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
      const { data } = await api.get('/subscriptions', {
        params: {
          page: page + 1,
          limit,
          search: query.search || undefined,
          status: query.status || undefined,
          customerId: query.customerId || undefined,
          planId: query.planId || undefined,
          from: query.from || undefined,
          to: query.to || undefined,
          paused: query.paused || undefined,
        },
      });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load subscriptions'));
    } finally {
      setLoading(false);
    }
  }, [limit, page, query]);

  const loadOptions = useCallback(async () => {
    try {
      const requests = [
        api.get('/plans', { params: { page: 1, limit: 100, active: true } }),
      ];
      if (canManage) {
        requests.push(api.get('/users', { params: { page: 1, limit: 100, role: 'customer', active: true } }));
      }
      const responses = await Promise.all(requests);
      setPlans(responses[0].data.items);
      if (canManage) setCustomers(responses[1].data.items);
    } catch (err) {
      setError(apiError(err, 'Could not load subscription filters'));
    }
  }, [canManage]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => loadOptions(), 0);
    return () => clearTimeout(timer);
  }, [loadOptions]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const columns = [
    {
      key: 'number',
      label: 'Subscription',
      render: (subscription) => (
        <Stack>
          <Typography sx={{ fontWeight: 600 }}>{subscription.number}</Typography>
          <Typography variant="caption" color="text.secondary">{subscription.customerId?.name || 'Customer unavailable'}</Typography>
        </Stack>
      ),
    },
    { key: 'plan', label: 'Plan', render: (subscription) => subscription.planId?.name || 'Plan unavailable' },
    { key: 'status', label: 'Status', render: (subscription) => <StatusChip status={subscription.status} /> },
    { key: 'dates', label: 'Dates', render: (subscription) => `${formatDateIST(subscription.startDate)} – ${formatDateIST(subscription.expiryDate)}` },
    { key: 'paused', label: 'Paused', render: (subscription) => subscription.isPaused ? <StatusChip status="Paused" /> : '—' },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (subscription) => (
        <Tooltip title="Open subscription">
          <IconButton component={Link} to={`/subscriptions/${subscription._id}`} aria-label={`Open ${subscription.number}`}>
            <OpenInNewOutlined />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="Build quotations, activate recurring services, and manage their lifecycle."
        action={canManage && <Button component={Link} to="/subscriptions/new" variant="contained" startIcon={<AddIcon />}>New subscription</Button>}
      />
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField size="small" label="Search number or customer" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} sx={{ minWidth: { sm: 250 } }} />
          <TextField select size="small" label="Status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All statuses</MenuItem>
            {statuses.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Paused" value={filters.paused} onChange={(event) => updateFilter('paused', event.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Paused</MenuItem>
            <MenuItem value="false">Not paused</MenuItem>
          </TextField>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {canManage && (
            <TextField select size="small" label="Customer" value={filters.customerId} onChange={(event) => updateFilter('customerId', event.target.value)} sx={{ minWidth: 220 }}>
              <MenuItem value="">All customers</MenuItem>
              {customers.map((customer) => <MenuItem key={customer._id} value={customer._id}>{customer.name} ({customer.email})</MenuItem>)}
            </TextField>
          )}
          <TextField select size="small" label="Plan" value={filters.planId} onChange={(event) => updateFilter('planId', event.target.value)} sx={{ minWidth: 190 }}>
            <MenuItem value="">All plans</MenuItem>
            {plans.map((plan) => <MenuItem key={plan._id} value={plan._id}>{plan.name}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="Starts from" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Starts to" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
      </Stack>
      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        emptyTitle="No subscriptions found"
        emptyDescription={canManage ? 'Create a subscription after configuring a plan and customer.' : 'Your subscriptions will appear here.'}
        aria-label="Subscriptions"
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
