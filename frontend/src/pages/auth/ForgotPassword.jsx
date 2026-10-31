import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material';
import AuthShell from '../../components/AuthShell';
import ErrorAlert from '../../components/ErrorAlert';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { isEmailValid } from '../../utils/password';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setSent(data.message);
    } catch (err) {
      setError(apiError(err, 'Could not send the reset link'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your registered email and we will send you a reset link.">
      {sent ? (
        <Stack spacing={2}>
          <Alert severity="success">{sent}</Alert>
          <Typography variant="body2" color="text.secondary">
            The link works once and expires in 1 hour. Check your spam folder if it does not arrive.
          </Typography>
          <Button component={RouterLink} to="/login" variant="contained" size="large">
            Back to sign in
          </Button>
        </Stack>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            <ErrorAlert error={error} />
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
            <Button type="submit" variant="contained" size="large" disabled={loading || !isEmailValid(email)}>
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
            <Typography variant="body2" sx={{ textAlign: 'center' }} color="text.secondary">
              <Link component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>Back to sign in</Link>
            </Typography>
          </Stack>
        </form>
      )}
    </AuthShell>
  );
}