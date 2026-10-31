import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Button, IconButton, InputAdornment, Stack, TextField } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import AuthShell from '../../components/AuthShell';
import ErrorAlert from '../../components/ErrorAlert';
import PasswordChecklist from '../../components/PasswordChecklist';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { isPasswordValid } from '../../utils/password';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState('');
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = token && isPasswordValid(password) && password === confirm;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, password });
      setDone(data.message);
    } catch (err) {
      setError(apiError(err, 'Could not reset the password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password for your account.">
      {done ? (
        <Stack spacing={2}>
          <Alert severity="success">{done}</Alert>
          <Button component={RouterLink} to="/login" variant="contained" size="large">
            Sign in
          </Button>
        </Stack>
      ) : !token ? (
        <Stack spacing={2}>
          <Alert severity="error">This reset link is incomplete. Please request a new one.</Alert>
          <Button component={RouterLink} to="/forgot-password" variant="contained" size="large">
            Request a new link
          </Button>
        </Stack>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            <ErrorAlert error={error} />
            <TextField
              label="New password"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
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
            <PasswordChecklist password={password} />
            <TextField
              label="Confirm new password"
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              error={mismatch}
              helperText={mismatch ? 'Passwords do not match' : ' '}
              required
            />
            <Button type="submit" variant="contained" size="large" disabled={loading || !canSubmit}>
              {loading ? 'Saving...' : 'Update password'}
            </Button>
          </Stack>
        </form>
      )}
    </AuthShell>
  );
}