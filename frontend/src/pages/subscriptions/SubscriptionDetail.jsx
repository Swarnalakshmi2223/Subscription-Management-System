import { useCallback, useEffect, useMemo, useState } from 'react';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import {
  Button,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
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

const lifecycle = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];

export default function SubscriptionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = ['admin', 'staff'].includes(user.role);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/subscriptions/${id}`);
      setSubscription(data.data);
    } catch (err) {
      setError(apiError(err, 'Failed to load subscription'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const actions = useMemo(() => {
    if (!subscription || !canManage) return [];
    const plan = subscription.planId || {};
    const today = new Date();
    const expired = new Date(subscription.expiryDate) <= today;
    const startsTodayOrEarlier = new Date(subscription.startDate) <= today;
    if (subscription.status === 'Draft') return [{ key: 'send-quotation', label: 'Send quotation' }];
    if (subscription.status === 'Quotation' && new Date(subscription.quotationValidUntil) >= today) return [{ key: 'confirm', label: 'Confirm subscription' }];
    if (subscription.status === 'Confirmed' && startsTodayOrEarlier) return [{ key: 'activate', label: 'Activate subscription' }];
    if (subscription.status === 'Active') {
      const result = [];
      if (subscription.isPaused) result.push({ key: 'resume', label: 'Resume subscription' });
      else if (plan.allowPause) result.push({ key: 'pause', label: 'Pause subscription' });
      if (expired || plan.allowEarlyClose) result.push({ key: 'close', label: 'Close subscription', dangerous: true });
      if (plan.allowRenew) result.push({ key: 'renew', label: 'Renew subscription' });
      return result;
    }
    if (subscription.status === 'Closed' && plan.allowRenew) return [{ key: 'renew', label: 'Renew subscription' }];
    return [];
  }, [canManage, subscription]);

  const runAction = async () => {
    if (!confirming) return;
    setWorking(true);
    setActionError(null);
    try {
      await api.patch(`/subscriptions/${id}/${confirming.key}`);
      setConfirming(null);
      await load();
    } catch (err) {
      setActionError(apiError(err, 'Could not update the subscription'));
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Typography color="text.secondary">Loading subscription…</Typography>;
  if (error) return <><PageHeader title="Subscription" action={<Button startIcon={<ArrowBackOutlined />} onClick={() => navigate('/subscriptions')}>Back</Button>} /><ErrorAlert error={error} /></>;
  if (!subscription) return null;

  const lines = subscription.lines || [];
  const subtotal = lines.reduce((sum, line) => sum + (line.unitPrice * line.quantity), 0);
  const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const activeStep = lifecycle.indexOf(subscription.status);

  return (
    <>
      <PageHeader
        title={subscription.number}
        subtitle={`${subscription.customerId?.name || 'Customer unavailable'} · ${subscription.planId?.name || 'Plan unavailable'}`}
        action={<Button startIcon={<ArrowBackOutlined />} onClick={() => navigate('/subscriptions')}>Back to subscriptions</Button>}
      />
      {actionError && <ErrorAlert error={actionError} sx={{ mb: 2 }} />}
      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="h6">Lifecycle</Typography><StatusChip status={subscription.status} />{subscription.isPaused && <StatusChip status="Paused" />}</Stack>
              {actions.length > 0 && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>{actions.map((action) => <Button key={action.key} variant={action.dangerous ? 'outlined' : 'contained'} color={action.dangerous ? 'error' : 'primary'} onClick={() => setConfirming(action)}>{action.label}</Button>)}</Stack>}
            </Stack>
            <Stepper activeStep={activeStep} alternativeLabel sx={{ overflowX: 'auto' }}>
              {lifecycle.map((status) => <Step key={status}><StepLabel>{status}</StepLabel></Step>)}
            </Stepper>
            {subscription.quotationValidUntil && <Typography variant="body2" color="text.secondary">Quotation valid until {formatDateTimeIST(subscription.quotationValidUntil)}</Typography>}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="h6">Subscription details</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ flexWrap: 'wrap' }}>
              <Detail label="Customer" value={subscription.customerId?.name} />
              <Detail label="Email" value={subscription.customerId?.email} />
              <Detail label="Plan" value={subscription.planId?.name} />
              <Detail label="Payment terms" value={subscription.paymentTerms} />
              <Detail label="Start date" value={formatDateIST(subscription.startDate)} />
              <Detail label="Expiry date" value={formatDateIST(subscription.expiryDate)} />
              {subscription.nextBillingDate && <Detail label="Next billing" value={formatDateIST(subscription.nextBillingDate)} />}
            </Stack>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="h6">Priced lines</Typography>
            <Table size="small" aria-label="Subscription lines">
              <TableHead><TableRow><TableCell>Description</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Unit price</TableCell><TableCell align="right">Tax</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
              <TableBody>{lines.map((line, index) => <TableRow key={`${line.productId?._id || line.productId}-${index}`}><TableCell>{line.description || line.productId?.name || 'Product'}</TableCell><TableCell align="right">{line.quantity}</TableCell><TableCell align="right">{formatINR(line.unitPrice)}</TableCell><TableCell align="right">{formatINR(line.taxAmount)}</TableCell><TableCell align="right">{formatINR(line.amount)}</TableCell></TableRow>)}</TableBody>
            </Table>
            <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}><Typography>Subtotal: {formatINR(subtotal)}</Typography><Typography>Tax: {formatINR(taxTotal)}</Typography><Typography variant="h6">Total: {formatINR(total)}</Typography></Stack>
          </Stack>
        </Paper>
      </Stack>
      <ConfirmDialog
        open={Boolean(confirming)}
        title={`${confirming?.label}?`}
        description="The server will validate the current lifecycle state and plan rules before applying this action."
        confirmLabel={confirming?.label || 'Confirm'}
        dangerous={confirming?.dangerous}
        loading={working}
        onClose={() => setConfirming(null)}
        onConfirm={runAction}
      />
    </>
  );
}

function Detail({ label, value }) {
  return <Stack spacing={0.25} sx={{ minWidth: 150 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography>{value || '—'}</Typography></Stack>;
}
