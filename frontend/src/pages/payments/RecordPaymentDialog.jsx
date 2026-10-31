import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import ErrorAlert from '../../components/ErrorAlert';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { dateInputToIST, toDateInputValue } from '../../utils/dates';
import { paiseToRupees, rupeesToPaise } from '../../utils/money';

const methods = ['cash', 'bank_transfer', 'card', 'upi', 'cheque'];

export default function RecordPaymentDialog({ open, invoice, onClose, onSuccess }) {
  const [method, setMethod] = useState('upi');
  const [amount, setAmount] = useState(() => (invoice ? String(paiseToRupees(invoice.outstanding)) : ''));
  const [paymentDate, setPaymentDate] = useState(() => toDateInputValue(new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    const amountPaise = rupeesToPaise(amount);
    if (!amount.trim() || amountPaise <= 0) {
      setError({ message: 'Enter a payment amount greater than zero' });
      return;
    }
    if (amountPaise > invoice.outstanding) {
      setError({ message: 'Payment cannot exceed the outstanding balance' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/payments', { invoiceId: invoice._id, method, amount: amountPaise, paymentDate: dateInputToIST(paymentDate), note: note.trim() || undefined });
      await onSuccess();
    } catch (err) {
      setError(apiError(err, 'Could not record payment'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={save} noValidate>
        <DialogTitle>Record payment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <ErrorAlert error={error} />
            <TextField label="Amount (₹)" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} required slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }} helperText={`Outstanding: ₹${paiseToRupees(invoice?.outstanding || 0).toFixed(2)}`} />
            <TextField select label="Payment method" value={method} onChange={(event) => setMethod(event.target.value)} required>{methods.map((value) => <MenuItem key={value} value={value}>{value.replace('_', ' ')}</MenuItem>)}</TextField>
            <TextField type="date" label="Payment date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Note" value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={2} inputProps={{ maxLength: 1000 }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}</Button></DialogActions>
      </form>
    </Dialog>
  );
}
