import { useState } from 'react';
import {
  Alert,
  Button,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PageHeader from '../../components/PageHeader';
import ErrorAlert from '../../components/ErrorAlert';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { apiError } from '../../utils/errors';

const addressFields = [
  ['line1', 'Address line'],
  ['city', 'City'],
  ['state', 'State'],
  ['zip', 'Postal code'],
  ['country', 'Country'],
];

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: user.name || '',
    phone: user.phone || '',
    company: user.company || '',
    address: Object.fromEntries(addressFields.map(([field]) => [field, user.address?.[field] || ''])),
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateAddress = (field, value) => setForm((current) => ({ ...current, address: { ...current.address, [field]: value } }));

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError({ message: 'Name is required' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch('/auth/profile', {
        name: form.name.trim(),
        phone: form.phone,
        company: form.company,
        address: form.address,
      });
      updateUser(data.user);
      setSaved(true);
    } catch (err) {
      setError(apiError(err, 'Could not update your profile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="My profile" subtitle="Keep your contact and billing details up to date." />
      <Paper variant="outlined" sx={{ maxWidth: 760, p: { xs: 2, sm: 3 } }}>
        <form onSubmit={save} noValidate>
          <Stack spacing={3}>
            <ErrorAlert error={error} />
            <Stack spacing={2}>
              <Typography variant="h6">Contact details</Typography>
              <TextField label="Full name" value={form.name} onChange={(event) => updateField('name', event.target.value)} required autoComplete="name" />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Email" value={user.email} disabled helperText="Email cannot be changed here." />
                <TextField label="Phone" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} autoComplete="tel" />
              </Stack>
              <TextField label="Company" value={form.company} onChange={(event) => updateField('company', event.target.value)} autoComplete="organization" />
            </Stack>
            <Stack spacing={2}>
              <Typography variant="h6">Address</Typography>
              <TextField label="Address line" value={form.address.line1} onChange={(event) => updateAddress('line1', event.target.value)} autoComplete="street-address" />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                {addressFields.slice(1).map(([field, label]) => <TextField key={field} label={label} value={form.address[field]} onChange={(event) => updateAddress(field, event.target.value)} autoComplete={field === 'zip' ? 'postal-code' : field} />)}
              </Stack>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}><Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button></Stack>
          </Stack>
        </form>
      </Paper>
      <Snackbar open={saved} autoHideDuration={3500} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity="success" variant="filled" onClose={() => setSaved(false)}>Profile updated</Alert></Snackbar>
    </>
  );
}
