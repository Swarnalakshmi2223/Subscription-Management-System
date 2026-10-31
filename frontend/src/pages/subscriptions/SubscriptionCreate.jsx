import { useCallback, useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import {
  Alert,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { dateInputToIST, toDateInputValue } from '../../utils/dates';
import { formatINR } from '../../utils/money';

const emptyLine = { productId: '', quantity: '1', variantAttribute: '', variantValue: '' };
const initialForm = { customerId: '', planId: '', templateId: '', startDate: toDateInputValue(new Date()), expiryDate: '', paymentTerms: 'immediate', lines: [{ ...emptyLine }] };

export default function SubscriptionCreate() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setOptionsError(null);
    try {
      const [customerResponse, planResponse, templateResponse, productResponse] = await Promise.all([
        api.get('/users', { params: { page: 1, limit: 100, role: 'customer', active: true } }),
        api.get('/plans', { params: { page: 1, limit: 100, active: true } }),
        api.get('/quotation-templates', { params: { page: 1, limit: 100, active: true } }),
        api.get('/products', { params: { page: 1, limit: 100, active: true } }),
      ]);
      setCustomers(customerResponse.data.items);
      setPlans(planResponse.data.items);
      setTemplates(templateResponse.data.items);
      setProducts(productResponse.data.items);
    } catch (err) {
      setOptionsError(apiError(err, 'Could not load subscription options'));
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadOptions(), 0);
    return () => clearTimeout(timer);
  }, [loadOptions]);

  const selectedPlan = plans.find((plan) => plan._id === form.planId);
  const selectedTemplates = useMemo(
    () => templates.filter((template) => String(template.planId?._id || template.planId) === String(form.planId)),
    [form.planId, templates]
  );

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setPreview(null);
    setPreviewError(null);
  };

  const updateLine = (index, field, value) => {
    setForm((current) => {
      const lines = current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line));
      if (field === 'productId') {
        lines[index].variantAttribute = '';
        lines[index].variantValue = '';
      }
      return { ...current, lines, templateId: '' };
    });
    setPreview(null);
    setPreviewError(null);
  };

  const validateForm = () => {
    if (!form.customerId || !form.planId || !form.startDate || !form.expiryDate) {
      return { message: 'Customer, plan, start date, and expiry date are required' };
    }
    if (new Date(form.expiryDate) <= new Date(form.startDate)) {
      return { message: 'Expiry date must be after the start date' };
    }
    if (!form.templateId && form.lines.length === 0) return { message: 'Add at least one custom product line' };
    if (!form.templateId) {
      for (const line of form.lines) {
        const quantity = Number(line.quantity);
        if (!line.productId || !Number.isSafeInteger(quantity) || quantity < 1) {
          return { message: 'Each custom line needs a product and positive whole-number quantity' };
        }
        if (Boolean(line.variantAttribute) !== Boolean(line.variantValue)) {
          return { message: 'Select both variant fields, or leave the variant blank' };
        }
      }
    }
    return null;
  };

  const getPayload = () => ({
    customerId: form.customerId,
    planId: form.planId,
    ...(form.templateId ? { templateId: form.templateId } : {
      lines: form.lines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        ...(line.variantAttribute ? { variant: { attribute: line.variantAttribute, value: line.variantValue } } : {}),
      })),
    }),
    startDate: dateInputToIST(form.startDate),
    expiryDate: dateInputToIST(form.expiryDate),
    paymentTerms: form.paymentTerms,
  });

  const previewPrice = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const { data } = await api.post('/subscriptions/preview', getPayload());
      setPreview(data.data);
    } catch (err) {
      setPreviewError(apiError(err, 'Could not calculate the server price preview'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const { data } = await api.post('/subscriptions', getPayload());
      navigate(`/subscriptions/${data.data._id}`);
    } catch (err) {
      setFormError(apiError(err, 'Could not create the subscription'));
    } finally {
      setSaving(false);
    }
  };

  const getProduct = (productId) => products.find((product) => product._id === productId);
  const addLine = () => updateForm('lines', [...form.lines, { ...emptyLine }]);
  const removeLine = (index) => updateForm('lines', form.lines.filter((_, lineIndex) => lineIndex !== index));

  return (
    <>
      <PageHeader
        title="New subscription"
        subtitle="The backend prices every line using the selected plan, products, variants, and taxes."
        action={<Button startIcon={<ArrowBackOutlined />} onClick={() => navigate('/subscriptions')}>Back to subscriptions</Button>}
      />
      {optionsError && <ErrorAlert error={optionsError} sx={{ mb: 2 }} />}
      {loadingOptions ? <Typography color="text.secondary">Loading subscription options…</Typography> : (
        <form onSubmit={save} noValidate>
          <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
              <Stack spacing={2}>
                <Typography variant="h6">Subscription details</Typography>
                <ErrorAlert error={formError} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField select label="Customer" value={form.customerId} onChange={(event) => updateForm('customerId', event.target.value)} required fullWidth>
                    <MenuItem value="" disabled>Select a customer</MenuItem>
                    {customers.map((customer) => <MenuItem key={customer._id} value={customer._id}>{customer.name} ({customer.email})</MenuItem>)}
                  </TextField>
                  <TextField select label="Plan" value={form.planId} onChange={(event) => setForm((current) => ({ ...current, planId: event.target.value, templateId: '', lines: [{ ...emptyLine }] }))} required fullWidth>
                    <MenuItem value="" disabled>Select a plan</MenuItem>
                    {plans.map((plan) => <MenuItem key={plan._id} value={plan._id}>{plan.name} · {plan.billingPeriod}</MenuItem>)}
                  </TextField>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField type="date" label="Start date" value={form.startDate} onChange={(event) => updateForm('startDate', event.target.value)} required fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                  <TextField type="date" label="Expiry date" value={form.expiryDate} onChange={(event) => updateForm('expiryDate', event.target.value)} required fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                  <TextField select label="Payment terms" value={form.paymentTerms} onChange={(event) => updateForm('paymentTerms', event.target.value)} fullWidth>
                    <MenuItem value="immediate">Immediate</MenuItem>
                    <MenuItem value="net15">Net 15</MenuItem>
                    <MenuItem value="net30">Net 30</MenuItem>
                  </TextField>
                </Stack>
                <TextField select label="Pricing source" value={form.templateId ? `template:${form.templateId}` : 'custom'} onChange={(event) => updateForm('templateId', event.target.value === 'custom' ? '' : event.target.value.replace('template:', ''))} disabled={!selectedPlan} helperText={!selectedPlan ? 'Select a plan first' : 'Use a template or enter custom product lines.'}>
                  <MenuItem value="custom">Custom product lines</MenuItem>
                  {selectedTemplates.map((template) => <MenuItem key={template._id} value={`template:${template._id}`}>{template.name} ({template.validityDays} day quotation)</MenuItem>)}
                </TextField>
              </Stack>
            </Paper>

            {!form.templateId && (
              <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                <Stack spacing={2}>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h6">Custom product lines</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={addLine}>Add line</Button>
                  </Stack>
                  {form.lines.map((line, index) => {
                    const product = getProduct(line.productId);
                    const attributes = [...new Set((product?.variants || []).map((variant) => variant.attribute))];
                    return (
                      <Stack key={`line-${index}`} spacing={1.5} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                          <TextField select size="small" label="Product" value={line.productId} onChange={(event) => updateLine(index, 'productId', event.target.value)} sx={{ flex: 1 }}>
                            <MenuItem value="" disabled>Select a product</MenuItem>
                            {products.map((productOption) => <MenuItem key={productOption._id} value={productOption._id}>{productOption.name}</MenuItem>)}
                          </TextField>
                          <TextField size="small" label="Quantity" type="number" value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} sx={{ width: { sm: 130 } }} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
                          <IconButton aria-label={`Remove line ${index + 1}`} onClick={() => removeLine(index)} disabled={form.lines.length === 1}><DeleteOutlineOutlined /></IconButton>
                        </Stack>
                        {attributes.length > 0 && (
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField select size="small" label="Variant attribute" value={line.variantAttribute} onChange={(event) => updateLine(index, 'variantAttribute', event.target.value)}>
                              <MenuItem value="">No variant</MenuItem>
                              {attributes.map((attribute) => <MenuItem key={attribute} value={attribute}>{attribute}</MenuItem>)}
                            </TextField>
                            <TextField select size="small" label="Variant value" value={line.variantValue} onChange={(event) => updateLine(index, 'variantValue', event.target.value)} disabled={!line.variantAttribute}>
                              <MenuItem value="">Select value</MenuItem>
                              {(product?.variants || []).filter((variant) => variant.attribute === line.variantAttribute).map((variant) => <MenuItem key={variant.value} value={variant.value}>{variant.value}</MenuItem>)}
                            </TextField>
                          </Stack>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            )}

            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                  <BoxedPreviewTitle />
                  <Button variant="outlined" onClick={previewPrice} disabled={previewLoading}>{previewLoading ? 'Calculating…' : 'Preview price'}</Button>
                </Stack>
                <ErrorAlert error={previewError} />
                {!preview && !previewError && <Alert severity="info">Preview is calculated by the backend and includes current product prices and taxes.</Alert>}
                {preview && <PricePreview preview={preview} />}
              </Stack>
            </Paper>

            <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
              <Button onClick={() => navigate('/subscriptions')} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Creating…' : 'Create draft subscription'}</Button>
            </Stack>
          </Stack>
        </form>
      )}
    </>
  );
}

function BoxedPreviewTitle() {
  return <Typography variant="h6">Server price preview</Typography>;
}

function PricePreview({ preview }) {
  return (
    <Stack spacing={2}>
      <Table size="small" aria-label="Subscription price preview">
        <TableHead><TableRow><TableCell>Line</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Unit price</TableCell><TableCell align="right">Tax</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
        <TableBody>
          {preview.lines.map((line, index) => <TableRow key={`${line.productId}-${index}`}><TableCell>{line.description}</TableCell><TableCell align="right">{line.quantity}</TableCell><TableCell align="right">{formatINR(line.unitPrice)}</TableCell><TableCell align="right">{formatINR(line.taxAmount)}</TableCell><TableCell align="right">{formatINR(line.amount)}</TableCell></TableRow>)}
        </TableBody>
      </Table>
      <Divider />
      <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
        <Typography>Subtotal: {formatINR(preview.subtotal)}</Typography>
        <Typography>Tax: {formatINR(preview.taxTotal)}</Typography>
        <Typography variant="h6">Total: {formatINR(preview.total)}</Typography>
      </Stack>
    </Stack>
  );
}
