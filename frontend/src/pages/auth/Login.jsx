import { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { Button, IconButton, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import AuthShell from '../../components/AuthShell';
import ErrorAlert from '../../components/ErrorAlert';
import { useAuth } from '../../context/AuthContext';
import { apiError } from '../../utils/errors';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiError(err, 'Unable to sign in'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your subscriptions.">
      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          <ErrorAlert error={error} />
          <TextField label="Email" name="email" type="email" value={form.email} onChange={onChange} autoComplete="email" autoFocus required />
          <TextField
            label="Password"
            name="password"
            type={show ? 'text' : 'password'}
            value={form.password}
            onChange={onChange}
            autoComplete="current-password"
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
          <Button type="submit" variant="contained" size="large" disabled={loading || !form.email || !form.password}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
          <Typography variant="body2" textAlign="center" color="text.secondary">
            New to Brightloop?{' '}
            <Link component={RouterLink} to="/register" fontWeight={600}>
              Create an account
            </Link>
          </Typography>
        </Stack>
      </form>
    </AuthShell>
  );
}