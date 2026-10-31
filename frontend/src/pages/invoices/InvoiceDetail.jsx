import { useCallback, useEffect, useMemo, useState } from 'react';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import {
  Button,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { formatDateIST, formatDateTimeIST } from '../../utils/dates';
import { formatINR } from '../../utils/money';
import RecordPaymentDialog from '../payments/RecordPaymentDialog';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = ['admin', 'staff'].includes(user.role);
  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [working, setWorking] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const requests = [api.get(`/invoices/${id}`), api.get('/payments', { params: { invoiceId: id, page: 1, limit: 100 } })];
      const [invoiceResponse, paymentResponse] = await Promise.all(requests);
      setInvoice(invoiceResponse.data.data);
      setPayments(paymentResponse.data.items);
    } catch (err) {
      setError(apiError(err, 'Failed to load invoice'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const actions = useMemo(() => {
    if (!invoice || !canManage) return [];
    const result = [];
    if (invoice.status === 'Draft') result.push({ key: 'confirm', label: 'Confirm invoice' });
    if (['Draft', 'Confirmed'].includes(invoice.status) && invoice.amountPaid === 0) result.push({ key: 'cancel', label: 'Cancel invoice', dangerous: true });
    if (['Confirmed', 'Paid'].includes(invoice.status)) result.push({ key: 'send', label: 'Send invoice' });
    return result;
  }, [canManage, invoice]);

  const runAction = async () => {
    if (!confirming) return;
    setWorking(true);
    setActionError(null);
    try {
      const method = confirming.key === 'send' ? 'post' : 'patch';
      await api[method](`/invoices/${id}/${confirming.key}`);
      setConfirming(null);
      await load();
    } catch (err) {
      setActionError(apiError(err, 'Could not update the invoice'));
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Typography color="text.secondary">Loading invoice…</Typography>;
  if (error) return <><PageHeader title="Invoice" action={<Button startIcon={<ArrowBackOutlined />} onClick={() => navigate('/invoices')}>Back</Button>} /><ErrorAlert error={error} /></>;
  if (!invoice) return null;

  const lines = invoice.lines || [];
  return (
    <>
      <PageHeader
        title={invoice.number}
        subtitle={`${invoice.customerId?.name || 'Customer unavailable'} · ${invoice.subscriptionId?.number || 'Subscription unavailable'}`}
        action={<Stack direction="row" spacing={1}><Button startIcon={<ArrowBackOutlined />} onClick={() => navigate('/invoices')}>Back to invoices</Button><Button className="no-print" startIcon={<PrintOutlined />} variant="outlined" onClick={() => window.print()}>Print</Button></Stack>}
      />
      <div className="invoice-printable">
        {actionError && <ErrorAlert error={actionError} sx={{ mb: 2 }} />}
        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="h6">Invoice status</Typography><StatusChip status={invoice.status} />{invoice.isOverdue && <StatusChip status="Overdue" />}</Stack>
                <Stack className="no-print" direction={{ xs: 'column', sm: 'row' }} spacing={1}>{actions.map((action) => <Button key={action.key} variant={action.dangerous ? 'outlined' : 'contained'} color={action.dangerous ? 'error' : 'primary'} onClick={() => setConfirming(action)}>{action.label}</Button>)}{invoice.status === 'Confirmed' && <Button variant="outlined" onClick={() => setPaymentOpen(true)}>Record payment</Button>}</Stack>
              </Stack>
              <Divider />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ flexWrap: 'wrap' }}>
                <Detail label="Customer" value={invoice.customerId?.name} />
                <Detail label="Email" value={invoice.customerId?.email} />
                <Detail label="Issued" value={formatDateIST(invoice.issueDate)} />
                <Detail label="Due" value={formatDateIST(invoice.dueDate)} />
                <Detail label="Billing period" value={`${formatDateIST(invoice.periodStart)} – ${formatDateIST(invoice.periodEnd)}`} />
                <Detail label="Sent" value={invoice.sentAt ? formatDateTimeIST(invoice.sentAt) : 'Not sent'} />
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={2}>
              <Typography variant="h6">Invoice lines</Typography>
              <Table size="small" aria-label="Invoice lines">
                <TableHead><TableRow><TableCell>Description</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Unit price</TableCell><TableCell align="right">Discount</TableCell><TableCell align="right">Tax</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
                <TableBody>{lines.map((line, index) => <TableRow key={`${line.productId?._id || line.productId}-${index}`}><TableCell>{line.description || line.productId?.name || 'Product'}</TableCell><TableCell align="right">{line.quantity}</TableCell><TableCell align="right">{formatINR(line.unitPrice)}</TableCell><TableCell align="right">{formatINR(line.discountAmount)}</TableCell><TableCell align="right">{formatINR(line.taxAmount)}</TableCell><TableCell align="right">{formatINR(line.amount)}</TableCell></TableRow>)}</TableBody>
              </Table>
              <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}><Typography>Subtotal: {formatINR(invoice.subtotal)}</Typography><Typography>Discount: {formatINR(invoice.discountTotal)}</Typography><Typography>Tax: {formatINR(invoice.taxTotal)}</Typography><Typography variant="h6">Total: {formatINR(invoice.total)}</Typography><Typography color="text.secondary">Paid: {formatINR(invoice.amountPaid)}</Typography><Typography sx={{ fontWeight: 700 }}>Outstanding: {formatINR(invoice.outstanding)}</Typography></Stack>
            </Stack>
          </Paper>

          <Paper className="no-print" variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={2}>
              <Typography variant="h6">Payment history</Typography>
              {payments.length === 0 ? <Typography color="text.secondary">No payments recorded.</Typography> : <Table size="small" aria-label="Payment history"><TableHead><TableRow><TableCell>Date</TableCell><TableCell>Method</TableCell><TableCell>Note</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{payments.map((payment) => <TableRow key={payment._id}><TableCell>{formatDateTimeIST(payment.paymentDate)}</TableCell><TableCell sx={{ textTransform: 'capitalize' }}>{payment.method.replace('_', ' ')}</TableCell><TableCell>{payment.note || '—'}</TableCell><TableCell align="right">{formatINR(payment.amount)}</TableCell></TableRow>)}</TableBody></Table>}
            </Stack>
          </Paper>
        </Stack>
      </div>
      <ConfirmDialog open={Boolean(confirming)} title={`${confirming?.label}?`} description="The server will validate the current invoice status before applying this action." confirmLabel={confirming?.label || 'Confirm'} dangerous={confirming?.dangerous} loading={working} onClose={() => setConfirming(null)} onConfirm={runAction} />
      <RecordPaymentDialog key={paymentOpen ? invoice._id : 'closed'} open={paymentOpen} invoice={invoice} onClose={() => setPaymentOpen(false)} onSuccess={async () => { setPaymentOpen(false); await load(); }} />
    </>
  );
}

function Detail({ label, value }) {
  return <Stack spacing={0.25} sx={{ minWidth: 160 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography>{value || '—'}</Typography></Stack>;
}
