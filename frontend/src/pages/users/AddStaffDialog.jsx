import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import ErrorAlert from '../../components/ErrorAlert';
import PasswordChecklist from '../../components/PasswordChecklist';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { isEmailValid, isPasswordValid } from '../../utils/password';

const empty = { name: '', email: '', phone: '', password: '' };

export default function AddStaffDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const canSubmit = form.name.trim() && isEmailValid(form.email) && isPasswordValid(form.password);

  const close = () => {
    setForm(empty);
    setError(null);
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/users/staff', form);
      setForm(empty);
      onCreated();
    } catch (err) {
      setError(apiError(err, 'Could not create the staff account'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Add staff member</DialogTitle>
      <form onSubmit={submit} noValidate>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <ErrorAlert error={error} />
          <TextField label="Full name" name="name" value={form.name} onChange={onChange} autoFocus required />
          <TextField label="Email" name="email" type="email" value={form.email} onChange={onChange} required autoComplete="email" />
          <TextField label="Phone (optional)" name="phone" value={form.phone} onChange={onChange} autoComplete="tel" />
          <TextField label="Temporary password" name="password" type="text" value={form.password} onChange={onChange} required autoComplete="new-password" />
          <PasswordChecklist password={form.password} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button type="button" onClick={close}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving || !canSubmit}>
          {saving ? 'Creating...' : 'Create staff'}
        </Button>
      </DialogActions>
      </form>
    </Dialog>
  );
}
