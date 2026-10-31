import { useCallback, useEffect, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import PowerSettingsNewOutlined from '@mui/icons-material/PowerSettingsNewOutlined';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
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
import { formatINR, paiseToRupees, rupeesToPaise } from '../../utils/money';

const emptyForm = {
  name: '',
  type: '',
  salesPrice: '',
  costPrice: '',
  notes: '',
  taxId: '',
  variants: [],
};

const variantIsEmpty = (variant) => !variant.attribute && !variant.value && !variant.extraPrice;

export default function Products() {
  const { user } = useAuth();
  const canEdit = user.role === 'admin';
  const [items, setItems] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
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
      const { data } = await api.get('/products', { params: { page: page + 1, limit, search: query || undefined } });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load products'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, query]);

  const loadTaxes = useCallback(async () => {
    try {
      const { data } = await api.get('/taxes', { params: { page: 1, limit: 100 } });
      setTaxes(data.items.filter((tax) => tax.isActive));
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err, 'Could not load tax options').message });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => loadTaxes(), 0);
    return () => clearTimeout(timer);
  }, [loadTaxes]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({
      name: product.name,
      type: product.type,
      salesPrice: String(paiseToRupees(product.salesPrice)),
      costPrice: String(paiseToRupees(product.costPrice)),
      notes: product.notes || '',
      taxId: product.taxId?._id || product.taxId || '',
      variants: (product.variants || []).map((variant) => ({
        attribute: variant.attribute,
        value: variant.value,
        extraPrice: String(paiseToRupees(variant.extraPrice)),
      })),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!saving) setDialogOpen(false);
  };

  const updateVariant = (index, field, value) => {
    const variants = form.variants.map((variant, variantIndex) => (
      variantIndex === index ? { ...variant, [field]: value } : variant
    ));
    setForm({ ...form, variants });
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.type.trim()) {
      setFormError({ message: 'Product name and type are required' });
      return;
    }
    const salesPrice = Number(form.salesPrice);
    const costPrice = Number(form.costPrice);
    if (form.salesPrice.trim() === '' || form.costPrice.trim() === '' || !Number.isFinite(salesPrice) || salesPrice < 0 || !Number.isFinite(costPrice) || costPrice < 0) {
      setFormError({ message: 'Sales and cost prices must be non-negative amounts in rupees' });
      return;
    }
    if (form.variants.some((variant) => variantIsEmpty(variant))) {
      setFormError({ message: 'Complete each variant or remove the empty row' });
      return;
    }

    const variants = form.variants.map((variant) => {
      const extraPrice = Number(variant.extraPrice);
      if (!variant.attribute.trim() || !variant.value.trim() || variant.extraPrice.trim() === '' || !Number.isFinite(extraPrice) || extraPrice < 0) return null;
      return {
        attribute: variant.attribute.trim(),
        value: variant.value.trim(),
        extraPrice: rupeesToPaise(extraPrice),
      };
    });
    if (variants.some((variant) => variant === null)) {
      setFormError({ message: 'Each variant needs an attribute, value, and non-negative extra price' });
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type.trim(),
        salesPrice: rupeesToPaise(salesPrice),
        costPrice: rupeesToPaise(costPrice),
        notes: form.notes,
        taxId: form.taxId || null,
        variants,
      };
      if (editing) await api.put(`/products/${editing._id}`, payload);
      else await api.post('/products', payload);
      setDialogOpen(false);
      setToast({ severity: 'success', message: editing ? 'Product updated' : 'Product created' });
      load();
    } catch (err) {
      setFormError(apiError(err, 'Could not save the product'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!confirming) return;
    const product = confirming;
    try {
      await api.patch(`/products/${product._id}/active`, { isActive: !product.isActive });
      setConfirming(null);
      setToast({ severity: 'success', message: `${product.name} ${product.isActive ? 'deactivated' : 'activated'}` });
      load();
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err).message });
    }
  };

  const columns = [
    { key: 'name', label: 'Product', render: (product) => <Stack><Typography sx={{ fontWeight: 600 }}>{product.name}</Typography><Typography variant="caption" color="text.secondary">{product.type}</Typography></Stack> },
    { key: 'salesPrice', label: 'Sales price', render: (product) => formatINR(product.salesPrice) },
    { key: 'costPrice', label: 'Cost price', render: (product) => formatINR(product.costPrice) },
    { key: 'tax', label: 'Tax', render: (product) => product.taxId ? `${product.taxId.name} (${product.taxId.ratePercent}%)` : 'None' },
    { key: 'variants', label: 'Variants', render: (product) => product.variants?.length || 0 },
    { key: 'status', label: 'Status', render: (product) => <StatusChip status={product.isActive ? 'Active' : 'Inactive'} color={product.isActive ? 'success' : 'default'} /> },
    ...(canEdit ? [{
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (product) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="Edit product"><IconButton aria-label={`Edit ${product.name}`} onClick={() => openEdit(product)}><EditOutlined /></IconButton></Tooltip>
          <Tooltip title={product.isActive ? 'Deactivate product' : 'Activate product'}>
            <IconButton aria-label={`${product.isActive ? 'Deactivate' : 'Activate'} ${product.name}`} onClick={() => setConfirming(product)} color={product.isActive ? 'error' : 'success'}>
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
        title="Products"
        subtitle="Manage catalog products, variants, and price snapshots."
        action={canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add product</Button>}
      />
      <TextField
        size="small"
        label="Search products"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ maxWidth: 360, mb: 2 }}
      />
      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        emptyTitle="No products found"
        emptyDescription={canEdit ? 'Add your first product to start building plans.' : 'No products have been configured yet.'}
        aria-label="Products"
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
          <DialogTitle>{editing ? 'Edit product' : 'Add product'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <ErrorAlert error={formError} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Product name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
                <TextField label="Type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} required />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Sales price (₹)" type="number" value={form.salesPrice} onChange={(event) => setForm({ ...form, salesPrice: event.target.value })} required slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
                <TextField label="Cost price (₹)" type="number" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} required slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
              </Stack>
              <TextField select label="Tax" value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })}>
                <MenuItem value="">No tax</MenuItem>
                {taxes.map((tax) => <MenuItem key={tax._id} value={tax._id}>{tax.name} ({tax.ratePercent}%)</MenuItem>)}
              </TextField>
              <TextField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} multiline minRows={3} />
              <Stack spacing={1}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 600 }}>Variants</Typography>
                  <Button size="small" onClick={() => setForm({ ...form, variants: [...form.variants, { attribute: '', value: '', extraPrice: '' }] })}>Add variant</Button>
                </Stack>
                {form.variants.map((variant, index) => (
                  <Stack key={`${index}-${variant.attribute}`} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                    <TextField size="small" label="Attribute" value={variant.attribute} onChange={(event) => updateVariant(index, 'attribute', event.target.value)} />
                    <TextField size="small" label="Value" value={variant.value} onChange={(event) => updateVariant(index, 'value', event.target.value)} />
                    <TextField size="small" label="Extra price (₹)" type="number" value={variant.extraPrice} onChange={(event) => updateVariant(index, 'extraPrice', event.target.value)} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
                    <IconButton aria-label="Remove variant" onClick={() => setForm({ ...form, variants: form.variants.filter((_, rowIndex) => rowIndex !== index) })}><DeleteOutlineOutlined /></IconButton>
                  </Stack>
                ))}
                {form.variants.length === 0 && <Typography variant="body2" color="text.secondary">No variants added.</Typography>}
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save product'}</Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={`${confirming?.isActive ? 'Deactivate' : 'Activate'} product?`}
        description={confirming ? `${confirming.name} will be ${confirming.isActive ? 'hidden from new selections' : 'available for new selections'}.` : undefined}
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
