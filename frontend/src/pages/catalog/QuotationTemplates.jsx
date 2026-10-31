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

const emptyForm = { name: '', validityDays: '30', planId: '', lines: [] };
const emptyLine = { productId: '', quantity: '1', variantAttribute: '', variantValue: '' };

export default function QuotationTemplates() {
  const { user } = useAuth();
  const canEdit = user.role === 'admin';
  const [items, setItems] = useState([]);
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
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
      const { data } = await api.get('/quotation-templates', { params: { page: page + 1, limit, search: query || undefined } });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load quotation templates'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, query]);

  const loadOptions = useCallback(async () => {
    try {
      const [planResponse, productResponse] = await Promise.all([
        api.get('/plans', { params: { page: 1, limit: 100, active: true } }),
        api.get('/products', { params: { page: 1, limit: 100, active: true } }),
      ]);
      setPlans(planResponse.data.items);
      setProducts(productResponse.data.items);
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err, 'Could not load template options').message });
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

  const openEdit = (template) => {
    setEditing(template);
    setForm({
      name: template.name,
      validityDays: String(template.validityDays),
      planId: template.planId?._id || template.planId || '',
      lines: (template.lines || []).map((line) => ({
        productId: line.productId?._id || line.productId,
        quantity: String(line.quantity),
        variantAttribute: line.variant?.attribute || '',
        variantValue: line.variant?.value || '',
      })),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!saving) setDialogOpen(false);
  };

  const getProduct = (productId) => products.find((product) => product._id === productId);

  const updateLine = (index, field, value) => {
    const lines = form.lines.map((line, lineIndex) => (
      lineIndex === index ? { ...line, [field]: value } : line
    ));
    if (field === 'productId') {
      lines[index].variantAttribute = '';
      lines[index].variantValue = '';
    }
    setForm({ ...form, lines });
  };

  const save = async (event) => {
    event.preventDefault();
    const validityDays = Number(form.validityDays);
    if (!form.name.trim() || !form.planId || form.lines.length === 0) {
      setFormError({ message: 'Name, plan, and at least one product line are required' });
      return;
    }
    if (form.validityDays.trim() === '' || !Number.isSafeInteger(validityDays) || validityDays < 1) {
      setFormError({ message: 'Validity must be a positive whole number of days' });
      return;
    }

    const plan = plans.find((item) => item._id === form.planId);
    const lines = [];
    for (const line of form.lines) {
      const quantity = Number(line.quantity);
      const product = getProduct(line.productId);
      if (!product || line.quantity.trim() === '' || !Number.isSafeInteger(quantity) || quantity < 1) {
        setFormError({ message: 'Each product line needs a product and positive whole-number quantity' });
        return;
      }
      if (plan && String(plan.productId?._id || plan.productId) === String(product._id) && quantity < plan.minQuantity) {
        setFormError({ message: `Quantity for ${product.name} must be at least ${plan.minQuantity}` });
        return;
      }
      const hasAttribute = Boolean(line.variantAttribute);
      const hasValue = Boolean(line.variantValue);
      if (hasAttribute !== hasValue) {
        setFormError({ message: 'Select both variant attribute and value, or leave the variant blank' });
        return;
      }
      lines.push({
        productId: product._id,
        quantity,
        ...(hasAttribute ? { variant: { attribute: line.variantAttribute, value: line.variantValue } } : {}),
      });
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = { name: form.name.trim(), validityDays, planId: form.planId, lines };
      if (editing) await api.put(`/quotation-templates/${editing._id}`, payload);
      else await api.post('/quotation-templates', payload);
      setDialogOpen(false);
      setToast({ severity: 'success', message: editing ? 'Quotation template updated' : 'Quotation template created' });
      load();
    } catch (err) {
      setFormError(apiError(err, 'Could not save the quotation template'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!confirming) return;
    const template = confirming;
    try {
      await api.patch(`/quotation-templates/${template._id}/active`, { isActive: !template.isActive });
      setConfirming(null);
      setToast({ severity: 'success', message: `${template.name} ${template.isActive ? 'deactivated' : 'activated'}` });
      load();
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err).message });
    }
  };

  const columns = [
    { key: 'name', label: 'Template', render: (template) => <Stack><Typography sx={{ fontWeight: 600 }}>{template.name}</Typography><Typography variant="caption" color="text.secondary">{template.planId?.name || 'Plan unavailable'}</Typography></Stack> },
    { key: 'validityDays', label: 'Validity', render: (template) => `${template.validityDays} days` },
    { key: 'lines', label: 'Products', render: (template) => template.lines?.length || 0 },
    { key: 'status', label: 'Status', render: (template) => <StatusChip status={template.isActive ? 'Active' : 'Inactive'} color={template.isActive ? 'success' : 'default'} /> },
    ...(canEdit ? [{
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (template) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="Edit template"><IconButton aria-label={`Edit ${template.name}`} onClick={() => openEdit(template)}><EditOutlined /></IconButton></Tooltip>
          <Tooltip title={template.isActive ? 'Deactivate template' : 'Activate template'}>
            <IconButton aria-label={`${template.isActive ? 'Deactivate' : 'Activate'} ${template.name}`} onClick={() => setConfirming(template)} color={template.isActive ? 'error' : 'success'}>
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
        title="Quotation templates"
        subtitle="Create reusable product bundles for customer quotations."
        action={canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add template</Button>}
      />
      <TextField size="small" label="Search templates" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ maxWidth: 360, mb: 2 }} />
      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        emptyTitle="No quotation templates found"
        emptyDescription={canEdit ? 'Create a template after configuring plans and products.' : 'No quotation templates have been configured yet.'}
        aria-label="Quotation templates"
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
          <DialogTitle>{editing ? 'Edit quotation template' : 'Add quotation template'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <ErrorAlert error={formError} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Template name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
                <TextField label="Validity (days)" type="number" value={form.validityDays} onChange={(event) => setForm({ ...form, validityDays: event.target.value })} required slotProps={{ htmlInput: { min: 1, step: 1 } }} />
              </Stack>
              <TextField select label="Plan" value={form.planId} onChange={(event) => setForm({ ...form, planId: event.target.value })} required>
                <MenuItem value="" disabled>Select a plan</MenuItem>
                {plans.map((plan) => <MenuItem key={plan._id} value={plan._id}>{plan.name} · {plan.billingPeriod}</MenuItem>)}
              </TextField>
              <Stack spacing={1}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 600 }}>Product lines</Typography>
                  <Button size="small" onClick={() => setForm({ ...form, lines: [...form.lines, { ...emptyLine }] })}>Add product</Button>
                </Stack>
                {form.lines.map((line, index) => {
                  const product = getProduct(line.productId);
                  return (
                    <Stack key={index} spacing={1} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                        <TextField select size="small" label="Product" value={line.productId} onChange={(event) => updateLine(index, 'productId', event.target.value)} sx={{ flex: 1 }}>
                          <MenuItem value="" disabled>Select a product</MenuItem>
                          {products.map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}
                        </TextField>
                        <TextField size="small" label="Quantity" type="number" value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} slotProps={{ htmlInput: { min: 1, step: 1 } }} sx={{ width: { sm: 130 } }} />
                        <IconButton aria-label="Remove product line" onClick={() => setForm({ ...form, lines: form.lines.filter((_, lineIndex) => lineIndex !== index) })}><DeleteOutlineOutlined /></IconButton>
                      </Stack>
                      {product?.variants?.length > 0 && (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                          <TextField select size="small" label="Variant attribute" value={line.variantAttribute} onChange={(event) => updateLine(index, 'variantAttribute', event.target.value)}>
                            <MenuItem value="">No variant</MenuItem>
                            {[...new Set(product.variants.map((variant) => variant.attribute))].map((attribute) => <MenuItem key={attribute} value={attribute}>{attribute}</MenuItem>)}
                          </TextField>
                          <TextField select size="small" label="Variant value" value={line.variantValue} onChange={(event) => updateLine(index, 'variantValue', event.target.value)} disabled={!line.variantAttribute}>
                            <MenuItem value="">Select value</MenuItem>
                            {product.variants.filter((variant) => variant.attribute === line.variantAttribute).map((variant) => <MenuItem key={variant.value} value={variant.value}>{variant.value}</MenuItem>)}
                          </TextField>
                        </Stack>
                      )}
                    </Stack>
                  );
                })}
                {form.lines.length === 0 && <Typography variant="body2" color="text.secondary">No product lines added.</Typography>}
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={`${confirming?.isActive ? 'Deactivate' : 'Activate'} template?`}
        description={confirming ? `${confirming.name} will be ${confirming.isActive ? 'hidden from new quotations' : 'available for new quotations'}.` : undefined}
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
