import { useCallback, useEffect, useState } from 'react';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import AttachMoneyOutlined from '@mui/icons-material/AttachMoneyOutlined';
import AutorenewOutlined from '@mui/icons-material/AutorenewOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import {
  Box,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import ErrorAlert from '../components/ErrorAlert';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { apiError } from '../utils/errors';
import { formatDateIST } from '../utils/dates';
import { formatINR } from '../utils/money';

const paymentMethods = [
  ['cash', 'Cash'],
  ['bank_transfer', 'Bank transfer'],
  ['card', 'Card'],
  ['upi', 'UPI'],
  ['cheque', 'Cheque'],
];

const customerAbilities = {
  admin: ['Create staff accounts', 'Manage products, plans, taxes and discounts', 'Oversee subscriptions, invoices and payments', 'View finance reports'],
  staff: ['Look after customers', 'Create quotations and subscriptions', 'Confirm, send and print invoices', 'Record payments'],
  customer: ['View your own subscriptions', 'View and print your own invoices', 'Track upcoming renewals'],
};

export default function Dashboard() {
  const { user } = useAuth();
  if (user.role === 'customer') return <CustomerWelcome user={user} />;
  return <FinanceDashboard user={user} />;
}

function FinanceDashboard({ user }) {
  const [filters, setFilters] = useState({ from: '', to: '', method: '' });
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        from: filters.from || undefined,
        to: filters.to || undefined,
        method: filters.method || undefined,
      };
      const [summaryResponse, revenueResponse, overdueResponse] = await Promise.all([
        api.get('/reports/summary', { params }),
        api.get('/reports/revenue', { params }),
        api.get('/reports/overdue', { params: { from: filters.from || undefined, to: filters.to || undefined, page: 1, limit: 8 } }),
      ]);
      setSummary(summaryResponse.data.data);
      setRevenue(revenueResponse.data.data);
      setOverdue(overdueResponse.data.items);
    } catch (err) {
      setError(apiError(err, 'Failed to load finance dashboard'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const revenueData = revenue.map((row) => ({ ...row, label: monthLabel(row.year, row.month), amountRupees: row.amount / 100 }));
  const overdueColumns = [
    { key: 'number', label: 'Invoice', render: (invoice) => <Typography component={Link} to={`/invoices/${invoice._id}`} sx={{ color: 'primary.main', fontWeight: 600, textDecoration: 'none' }}>{invoice.number}</Typography> },
    { key: 'customer', label: 'Customer', render: (invoice) => invoice.customer?.name || 'Customer unavailable' },
    { key: 'dueDate', label: 'Due', render: (invoice) => formatDateIST(invoice.dueDate) },
    { key: 'daysOverdue', label: 'Days overdue', align: 'right', render: (invoice) => invoice.daysOverdue },
    { key: 'outstanding', label: 'Outstanding', align: 'right', render: (invoice) => formatINR(invoice.outstanding) },
  ];

  return (
    <>
      <PageHeader title="Finance dashboard" subtitle={`Welcome, ${user.name.split(' ')[0]}. Monitor subscription revenue and collections.`} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField size="small" type="date" label="Payments from" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Payments to" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select size="small" label="Payment method" value={filters.method} onChange={(event) => updateFilter('method', event.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All methods</MenuItem>
          {paymentMethods.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
      </Stack>
      {error && <ErrorAlert error={error} sx={{ mb: 3 }} />}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <MetricCard label="Active subscriptions" value={summary?.activeSubscriptions ?? '—'} icon={<AutorenewOutlined />} tone="primary" loading={loading} />
        <MetricCard label="Revenue collected" value={summary ? formatINR(summary.revenueCollected) : '—'} icon={<AttachMoneyOutlined />} tone="success" loading={loading} />
        <MetricCard label="Outstanding amount" value={summary ? formatINR(summary.outstandingAmount) : '—'} icon={<AccountBalanceWalletOutlined />} tone="warning" loading={loading} />
        <MetricCard label="Overdue invoices" value={summary ? `${summary.overdueCount} · ${formatINR(summary.overdueAmount)}` : '—'} icon={<WarningAmberOutlined />} tone="error" loading={loading} />
      </Stack>

      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1 }}>
              <Box><Typography variant="h6">Monthly revenue</Typography><Typography variant="body2" color="text.secondary">Payments grouped by India calendar month.</Typography></Box>
              {revenue.length > 0 && <Typography variant="body2" color="text.secondary">{revenue.length} month{revenue.length === 1 ? '' : 's'}</Typography>}
            </Stack>
            {loading ? <Box sx={{ height: 280 }} /> : revenueData.length === 0 ? <EmptyState title="No revenue yet" description="Recorded payments will appear here as monthly revenue." /> : <Box sx={{ width: '100%', height: 280 }}><ResponsiveContainer><LineChart data={revenueData} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `₹${value}`} width={74} /><Tooltip formatter={(value) => [formatINR(Math.round(value * 100)), 'Revenue']} /><Line type="monotone" dataKey="amountRupees" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></Box>}
          </Stack>
        </Paper>

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Overdue invoices</Typography>
            <DataTable columns={overdueColumns} rows={overdue} loading={loading} emptyTitle="No overdue invoices" emptyDescription="All confirmed invoices are currently within their due dates." aria-label="Overdue invoices" />
          </Box>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: { lg: 290 }, alignSelf: 'flex-start' }}>
            <Stack spacing={2}>
              <Typography variant="h6">Subscription mix</Typography>
              {summary?.subscriptionsByStatus?.length ? summary.subscriptionsByStatus.map((row) => <Stack key={row.status} direction="row" sx={{ justifyContent: 'space-between', gap: 3 }}><Typography color="text.secondary">{row.status}</Typography><Typography sx={{ fontWeight: 700 }}>{row.count}</Typography></Stack>) : <Typography color="text.secondary">No subscriptions yet.</Typography>}
            </Stack>
          </Paper>
        </Stack>
      </Stack>
    </>
  );
}

function MetricCard({ label, value, icon, tone, loading }) {
  return <Paper variant="outlined" sx={{ flex: '1 1 220px', p: 2.25 }}><Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><Box sx={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 2, bgcolor: `${tone}.light`, color: `${tone}.dark` }}>{icon}</Box><Box sx={{ minWidth: 0 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ mt: 0.25 }}>{loading ? '…' : value}</Typography></Box></Stack></Paper>;
}

function monthLabel(year, month) {
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function CustomerWelcome({ user }) {
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle="Here is what you can do with your account." />
      <Paper variant="outlined" sx={{ maxWidth: 640, p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 1.5, textTransform: 'capitalize' }}>{user.role} access</Typography>
        <Stack spacing={1}>{customerAbilities[user.role].map((ability) => <Typography key={ability} color="text.secondary">• {ability}</Typography>)}</Stack>
      </Paper>
    </>
  );
}
