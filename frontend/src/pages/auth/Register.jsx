import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Button, IconButton, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import AuthShell from '../../components/AuthShell';
import ErrorAlert from '../../components/ErrorAlert';
import PasswordChecklist from '../../components/PasswordChecklist';
import { useAuth } from '../../context/AuthContext';
import { apiError } from '../../utils/errors';
import { isEmailValid, isPasswordValid } from '../../utils/password';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', company: '', phone: '', password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  const emailBad = form.email.length > 0 && !isEmailValid(form.email);
  const canSubmit =
    form.name.trim() && isEmailValid(form.email) && isPasswordValid(form.password) && form.password === form.confirm;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { confirm, ...payload } = form; // eslint-disable-line no-unused-vars
      await register(payload);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Unable to create the account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Manage your subscriptions and invoices in one portal.">
      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          <ErrorAlert error={error} />
          <TextField label="Full name" name="name" value={form.name} onChange={onChange} autoComplete="name" autoFocus required />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={onChange}
            autoComplete="email"
            error={emailBad}
            helperText={emailBad ? 'Enter a valid email address' : ' '}
            required
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Company (optional)" name="company" value={form.company} onChange={onChange} />
            <TextField label="Phone (optional)" name="phone" value={form.phone} onChange={onChange} />
          </Stack>
          <TextField
            label="Password"
            name="password"
            type={show ? 'text' : 'password'}
            value={form.password}
            onChange={onChange}
            autoComplete="new-password"
            required
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShow(!show)} edge="end" aria-label="toggle password visibility">
                      {show ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <PasswordChecklist password={form.password} />
          <TextField
            label="Confirm password"
            name="confirm"
            type={show ? 'text' : 'password'}
            value={form.confirm}
            onChange={onChange}
            autoComplete="new-password"
            error={mismatch}
            helperText={mismatch ? 'Passwords do not match' : ' '}
            required
          />
          <Button type="submit" variant="contained" size="large" disabled={loading || !canSubmit}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
          <Typography variant="body2" textAlign="center" color="text.secondary">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login" fontWeight={600}>
              Sign in
            </Link>
          </Typography>
        </Stack>
      </form>
    </AuthShell>
  );
}