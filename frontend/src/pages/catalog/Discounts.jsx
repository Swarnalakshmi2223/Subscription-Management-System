import { useCallback, useEffect, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import EditOutlined from '@mui/icons-material/EditOutlined';
import PowerSettingsNewOutlined from '@mui/icons-material/PowerSettingsNewOutlined';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  IconButton,
} from '@mui/material';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { dateInputToIST, formatDateIST, toDateInputValue } from '../../utils/dates';
import { formatINR, paiseToRupees, rupeesToPaise } from '../../utils/money';

const emptyForm = {
  name: '',
  type: 'percentage',
  value: '',
  minPurchase: '0',
  minQuantity: '1',
  startDate: '',
  endDate: '',
  usageLimit: '',
  appliesTo: 'products',
  productIds: [],
  subscriptionIds: [],
};

export default function Discounts() {
  const { user } = useAuth();
  const canEdit = user.role === 'admin';
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [appliesTo, setAppliesTo] = useState('');
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
      const { data } = await api.get('/discounts', {
        params: {
          page: page + 1,
          limit,
          search: query || undefined,
          type: type || undefined,
          appliesTo: appliesTo || undefined,
        },
      });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load discounts'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, query, type, appliesTo]);

  const loadOptions = useCallback(async () => {
    try {
      const [productResponse, subscriptionResponse] = await Promise.all([
        api.get('/products', { params: { page: 1, limit: 100, active: true } }),
        api.get('/subscriptions', { params: { page: 1, limit: 100 } }),
      ]);
      setProducts(productResponse.data.items);
      setSubscriptions(subscriptionResponse.data.items);
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err, 'Could not load discount targets').message });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => loadOptions(), 0);
    return () => clearTimeout(timer);
  }, [loadOptions]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (discount) => {
    setEditing(discount);
    setForm({
      name: discount.name,
      type: discount.type,
      value: discount.type === 'fixed' ? String(paiseToRupees(discount.value)) : String(discount.value),
      minPurchase: String(paiseToRupees(discount.minPurchase)),
      minQuantity: String(discount.minQuantity),
      startDate: toDateInputValue(discount.startDate),
      endDate: toDateInputValue(discount.endDate),
      usageLimit: discount.usageLimit === null ? '' : String(discount.usageLimit),
      appliesTo: discount.appliesTo,
      productIds: (discount.productIds || []).map((item) => item._id || item),
      subscriptionIds: (discount.subscriptionIds || []).map((item) => item._id || item),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!saving) setDialogOpen(false);
  };

  const changeAppliesTo = (value) => {
    setForm({
      ...form,
      appliesTo: value,
      productIds: value === 'products' ? form.productIds : [],
      subscriptionIds: value === 'subscriptions' ? form.subscriptionIds : [],
    });
  };

  const save = async (event) => {
    event.preventDefault();
    const value = Number(form.value);
    const minPurchase = Number(form.minPurchase);
    const minQuantity = Number(form.minQuantity);
    const usageLimit = form.usageLimit.trim() === '' ? null : Number(form.usageLimit);
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      setFormError({ message: 'Name, start date, and end date are required' });
      return;
    }
    if (form.value.trim() === '' || !Number.isFinite(value) || value <= 0) {
      setFormError({ message: 'Discount value must be greater than zero' });
      return;
    }
    if (form.type === 'percentage' && value > 100) {
      setFormError({ message: 'Percentage discounts cannot exceed 100' });
      return;
    }
    if (form.minPurchase.trim() === '' || !Number.isFinite(minPurchase) || minPurchase < 0 || form.minQuantity.trim() === '' || !Number.isSafeInteger(minQuantity) || minQuantity < 1) {
      setFormError({ message: 'Minimum purchase must be non-negative and minimum quantity must be a positive whole number' });
      return;
    }
    if (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 1)) {
      setFormError({ message: 'Usage limit must be a positive whole number or left blank' });
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setFormError({ message: 'End date must be on or after start date' });
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      value: form.type === 'fixed' ? rupeesToPaise(value) : value,
      minPurchase: rupeesToPaise(minPurchase),
      minQuantity,
      startDate: dateInputToIST(form.startDate),
      endDate: dateInputToIST(form.endDate),
      usageLimit,
      appliesTo: form.appliesTo,
      productIds: form.appliesTo === 'products' ? form.productIds : [],
      subscriptionIds: form.appliesTo === 'subscriptions' ? form.subscriptionIds : [],
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) await api.put(`/discounts/${editing._id}`, payload);
      else await api.post('/discounts', payload);
      setDialogOpen(false);
      setToast({ severity: 'success', message: editing ? 'Discount updated' : 'Discount created' });
      load();
    } catch (err) {
      setFormError(apiError(err, 'Could not save the discount'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!confirming) return;
    const discount = confirming;
    try {
      await api.patch(`/discounts/${discount._id}/active`, { isActive: !discount.isActive });
      setConfirming(null);
      setToast({ severity: 'success', message: `${discount.name} ${discount.isActive ? 'deactivated' : 'activated'}` });
      load();
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err).message });
    }
  };

  const columns = [
    { key: 'name', label: 'Discount' },
    { key: 'value', label: 'Value', render: (discount) => discount.type === 'fixed' ? formatINR(discount.value) : `${discount.value}%` },
    { key: 'minimums', label: 'Minimums', render: (discount) => `${formatINR(discount.minPurchase)} · ${discount.minQuantity} item${discount.minQuantity === 1 ? '' : 's'}` },
    { key: 'target', label: 'Target', render: (discount) => <StatusChip status={discount.appliesTo === 'products' ? 'Products' : 'Subscriptions'} color="info" /> },
    { key: 'dates', label: 'Valid dates', render: (discount) => `${formatDateIST(discount.startDate)} – ${formatDateIST(discount.endDate)}` },
    { key: 'usage', label: 'Usage', render: (discount) => `${discount.usageCount || 0} / ${discount.usageLimit ?? '∞'}` },
    { key: 'status', label: 'Status', render: (discount) => <StatusChip status={discount.isActive ? 'Active' : 'Inactive'} color={discount.isActive ? 'success' : 'default'} /> },
    ...(canEdit ? [{
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (discount) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="Edit discount"><IconButton aria-label={`Edit ${discount.name}`} onClick={() => openEdit(discount)}><EditOutlined /></IconButton></Tooltip>
          <Tooltip title={discount.isActive ? 'Deactivate discount' : 'Activate discount'}>
            <IconButton aria-label={`${discount.isActive ? 'Deactivate' : 'Activate'} ${discount.name}`} onClick={() => setConfirming(discount)} color={discount.isActive ? 'error' : 'success'}>
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
        title="Discounts"
        subtitle="Apply controlled fixed or percentage savings to future invoices."
        action={canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add discount</Button>}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField size="small" label="Search discounts" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ maxWidth: 300 }} />
        <TextField select size="small" label="Type" value={type} onChange={(event) => { setType(event.target.value); setPage(0); }} sx={{ minWidth: 150 }}>
          <MenuItem value="">All types</MenuItem>
          <MenuItem value="fixed">Fixed</MenuItem>
          <MenuItem value="percentage">Percentage</MenuItem>
        </TextField>
        <TextField select size="small" label="Target" value={appliesTo} onChange={(event) => { setAppliesTo(event.target.value); setPage(0); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">All targets</MenuItem>
          <MenuItem value="products">Products</MenuItem>
          <MenuItem value="subscriptions">Subscriptions</MenuItem>
        </TextField>
      </Stack>
      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        emptyTitle="No discounts found"
        emptyDescription={canEdit ? 'Create a discount for your next billing run.' : 'No discounts have been configured yet.'}
        aria-label="Discounts"
        pagination={{
          total,
          page,
          rowsPerPage: limit,
          onPageChange: (_event, nextPage) => setPage(nextPage),
          onRowsPerPageChange: (event) => { setLimit(Number(event.target.value)); setPage(0); },
        }}
      />

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="md">
        <form onSubmit={save} noValidate>
          <DialogTitle>{editing ? 'Edit discount' : 'Add discount'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <ErrorAlert error={formError} />
              <TextField label="Discount name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField select label="Discount type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                  <MenuItem value="percentage">Percentage</MenuItem>
                  <MenuItem value="fixed">Fixed amount</MenuItem>
                </TextField>
                <TextField label={form.type === 'fixed' ? 'Value (₹)' : 'Value (%)'} type="number" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} required slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
                <TextField label="Minimum purchase (₹)" type="number" value={form.minPurchase} onChange={(event) => setForm({ ...form, minPurchase: event.target.value })} required slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Minimum quantity" type="number" value={form.minQuantity} onChange={(event) => setForm({ ...form, minQuantity: event.target.value })} required slotProps={{ htmlInput: { min: 1, step: 1 } }} />
                <TextField label="Usage limit (optional)" type="number" value={form.usageLimit} onChange={(event) => setForm({ ...form, usageLimit: event.target.value })} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Valid from" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Valid until" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
              <TextField select label="Applies to" value={form.appliesTo} onChange={(event) => changeAppliesTo(event.target.value)}>
                <MenuItem value="products">Products</MenuItem>
                <MenuItem value="subscriptions">Subscriptions</MenuItem>
              </TextField>
              {form.appliesTo === 'products' ? (
                <FormControl fullWidth>
                  <InputLabel id="discount-products-label">Products (empty means all)</InputLabel>
                  <Select
                    labelId="discount-products-label"
                    multiple
                    value={form.productIds}
                    onChange={(event) => setForm({ ...form, productIds: event.target.value })}
                    label="Products (empty means all)"
                    renderValue={(selected) => selected.map((id) => products.find((product) => product._id === id)?.name || id).join(', ')}
                  >
                    {products.map((product) => (
                      <MenuItem key={product._id} value={product._id}>
                        <Checkbox checked={form.productIds.includes(product._id)} />
                        <ListItemText primary={product.name} secondary={product.type} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <FormControl fullWidth>
                  <InputLabel id="discount-subscriptions-label">Subscriptions (empty means all)</InputLabel>
                  <Select
                    labelId="discount-subscriptions-label"
                    multiple
                    value={form.subscriptionIds}
                    onChange={(event) => setForm({ ...form, subscriptionIds: event.target.value })}
                    label="Subscriptions (empty means all)"
                    renderValue={(selected) => selected.map((id) => subscriptions.find((subscription) => subscription._id === id)?.number || id).join(', ')}
                  >
                    {subscriptions.map((subscription) => (
                      <MenuItem key={subscription._id} value={subscription._id}>
                        <Checkbox checked={form.subscriptionIds.includes(subscription._id)} />
                        <ListItemText primary={subscription.number} secondary={subscription.customerId?.name || subscription.status} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save discount'}</Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={`${confirming?.isActive ? 'Deactivate' : 'Activate'} discount?`}
        description={confirming ? `${confirming.name} will ${confirming.isActive ? 'stop applying to new invoices' : 'become eligible for new invoices'}.` : undefined}
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
