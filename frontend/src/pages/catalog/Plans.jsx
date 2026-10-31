import { useCallback, useEffect, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import EditOutlined from '@mui/icons-material/EditOutlined';
import PowerSettingsNewOutlined from '@mui/icons-material/PowerSettingsNewOutlined';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { formatDateIST, dateInputToIST, toDateInputValue } from '../../utils/dates';
import { formatINR, paiseToRupees, rupeesToPaise } from '../../utils/money';

const emptyForm = {
  name: '',
  productId: '',
  price: '',
  billingPeriod: 'monthly',
  minQuantity: '1',
  startDate: '',
  endDate: '',
  autoClose: true,
  allowEarlyClose: false,
  allowPause: false,
  allowRenew: true,
};

const flags = [
  ['autoClose', 'Auto-close at expiry'],
  ['allowEarlyClose', 'Allow early close'],
  ['allowPause', 'Allow pause'],
  ['allowRenew', 'Allow renew'],
];

export default function Plans() {
  const { user } = useAuth();
  const canEdit = user.role === 'admin';
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/plans', {
        params: {
          page: page + 1,
          limit,
          search: query || undefined,
          billingPeriod: period || undefined,
        },
      });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load plans'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, query, period]);

  const loadProducts = useCallback(async () => {
    try {
      const { data } = await api.get('/products', { params: { page: 1, limit: 100, active: true } });
      setProducts(data.items);
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err, 'Could not load product options').message });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(), 0);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (plan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      productId: plan.productId?._id || plan.productId || '',
      price: String(paiseToRupees(plan.price)),
      billingPeriod: plan.billingPeriod,
      minQuantity: String(plan.minQuantity),
      startDate: toDateInputValue(plan.startDate),
      endDate: toDateInputValue(plan.endDate),
      autoClose: plan.autoClose,
      allowEarlyClose: plan.allowEarlyClose,
      allowPause: plan.allowPause,
      allowRenew: plan.allowRenew,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!saving) setDialogOpen(false);
  };

  const save = async (event) => {
    event.preventDefault();
    const price = Number(form.price);
    const minQuantity = Number(form.minQuantity);
    if (!form.name.trim() || !form.productId || !form.startDate || !form.endDate) {
      setFormError({ message: 'Name, product, availability dates, and price are required' });
      return;
    }
    if (form.price.trim() === '' || form.minQuantity.trim() === '' || !Number.isFinite(price) || price < 0 || !Number.isFinite(minQuantity) || !Number.isSafeInteger(minQuantity) || minQuantity < 1) {
      setFormError({ message: 'Price must be non-negative and minimum quantity must be a positive whole number' });
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setFormError({ message: 'End date must be on or after start date' });
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        productId: form.productId,
        price: rupeesToPaise(price),
        billingPeriod: form.billingPeriod,
        minQuantity,
        startDate: dateInputToIST(form.startDate),
        endDate: dateInputToIST(form.endDate),
        autoClose: form.autoClose,
        allowEarlyClose: form.allowEarlyClose,
        allowPause: form.allowPause,
        allowRenew: form.allowRenew,
      };
      if (editing) await api.put(`/plans/${editing._id}`, payload);
      else await api.post('/plans', payload);
      setDialogOpen(false);
      setToast({ severity: 'success', message: editing ? 'Plan updated' : 'Plan created' });
      load();
    } catch (err) {
      setFormError(apiError(err, 'Could not save the plan'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!confirming) return;
    const plan = confirming;
    try {
      await api.patch(`/plans/${plan._id}/active`, { isActive: !plan.isActive });
      setConfirming(null);
      setToast({ severity: 'success', message: `${plan.name} ${plan.isActive ? 'deactivated' : 'activated'}` });
      load();
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err).message });
    }
  };

  const columns = [
    { key: 'name', label: 'Plan', render: (plan) => <Stack><Typography sx={{ fontWeight: 600 }}>{plan.name}</Typography><Typography variant="caption" color="text.secondary">{plan.productId?.name || 'Product unavailable'}</Typography></Stack> },
    { key: 'price', label: 'Price', render: (plan) => <Stack><Typography sx={{ fontWeight: 600 }}>{formatINR(plan.price)}</Typography><Typography variant="caption" color="text.secondary">per {plan.billingPeriod}</Typography></Stack> },
    { key: 'availability', label: 'Availability', render: (plan) => `${formatDateIST(plan.startDate)} – ${formatDateIST(plan.endDate)}` },
    { key: 'quantity', label: 'Min qty', render: (plan) => plan.minQuantity },
    { key: 'flags', label: 'Rules', render: (plan) => <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}><StatusChip status={plan.autoClose ? 'Auto-close' : 'Manual close'} color={plan.autoClose ? 'success' : 'default'} /><StatusChip status={plan.allowPause ? 'Pause' : 'No pause'} color={plan.allowPause ? 'info' : 'default'} /></Stack> },
    { key: 'status', label: 'Status', render: (plan) => <StatusChip status={plan.isActive ? 'Active' : 'Inactive'} color={plan.isActive ? 'success' : 'default'} /> },
    ...(canEdit ? [{
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (plan) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="Edit plan"><IconButton aria-label={`Edit ${plan.name}`} onClick={() => openEdit(plan)}><EditOutlined /></IconButton></Tooltip>
          <Tooltip title={plan.isActive ? 'Deactivate plan' : 'Activate plan'}>
            <IconButton aria-label={`${plan.isActive ? 'Deactivate' : 'Activate'} ${plan.name}`} onClick={() => setConfirming(plan)} color={plan.isActive ? 'error' : 'success'}>
              <PowerSettingsNewOutlined />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="Set recurring prices, availability, and subscription rules."
        action={canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add plan</Button>}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField size="small" label="Search plans" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ maxWidth: 360 }} />
        <TextField select size="small" label="Billing period" value={period} onChange={(event) => { setPeriod(event.target.value); setPage(0); }} sx={{ minWidth: 170 }}>
          <MenuItem value="">All periods</MenuItem>
          {['daily', 'weekly', 'monthly', 'yearly'].map((value) => <MenuItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</MenuItem>)}
        </TextField>
      </Stack>
      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        emptyTitle="No plans found"
        emptyDescription={canEdit ? 'Create a plan after configuring a product.' : 'No subscription plans have been configured yet.'}
        aria-label="Plans"
        pagination={{
          total,
          page,
          rowsPerPage: limit,
          onPageChange: (_event, nextPage) => setPage(nextPage),
          onRowsPerPageChange: (event) => { setLimit(Number(event.target.value)); setPage(0); },
        }}
      />

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <form onSubmit={save} noValidate>
          <DialogTitle>{editing ? 'Edit plan' : 'Add plan'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <ErrorAlert error={formError} />
              <TextField label="Plan name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
              <TextField select label="Product" value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} required>
                <MenuItem value="" disabled>Select a product</MenuItem>
                {products.map((product) => <MenuItem key={product._id} value={product._id}>{product.name}</MenuItem>)}
              </TextField>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Price (₹)" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
                <TextField select label="Billing period" value={form.billingPeriod} onChange={(event) => setForm({ ...form, billingPeriod: event.target.value })} required>
                  {['daily', 'weekly', 'monthly', 'yearly'].map((value) => <MenuItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</MenuItem>)}
                </TextField>
                <TextField label="Minimum quantity" type="number" value={form.minQuantity} onChange={(event) => setForm({ ...form, minQuantity: event.target.value })} required slotProps={{ htmlInput: { min: 1, step: 1 } }} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Available from" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Available until" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
              <Stack>
                <Typography sx={{ mb: 0.5, fontWeight: 600 }}>Plan rules</Typography>
                {flags.map(([field, label]) => (
                  <FormControlLabel
                    key={field}
                    control={<Switch checked={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.checked })} />}
                    label={label}
                  />
                ))}
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save plan'}</Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={`${confirming?.isActive ? 'Deactivate' : 'Activate'} plan?`}
        description={confirming ? `${confirming.name} will be ${confirming.isActive ? 'hidden from new subscription selections' : 'available for new subscription selections'}.` : undefined}
        confirmLabel={confirming?.isActive ? 'Deactivate' : 'Activate'}
        dangerous={confirming?.isActive}
        onClose={() => setConfirming(null)}
        onConfirm={toggleStatus}
      />

      <Snackbar open={Boolean(toast)} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast && <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.message}</Alert>}
      </Snackbar>
    </>
  );
}
