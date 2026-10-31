import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Container, Typography } from '@mui/material';
import api from './services/api';

export default function App() {
  const [status, setStatus] = useState({ loading: true, ok: false, message: '' });

  useEffect(() => {
    api
      .get('/health')
      .then((res) => setStatus({ loading: false, ok: true, message: res.data.message }))
      .catch(() => setStatus({ loading: false, ok: false, message: 'Cannot reach the API' }));
  }, []);

  return (
    <Container maxWidth="sm" sx={{ mt: 10 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Subscription Management System
      </Typography>
      <Typography color="text.secondary" gutterBottom>
        Brightloop Software
      </Typography>
      <Box sx={{ mt: 3 }}>
        {status.loading ? (
          <CircularProgress />
        ) : (
          <Alert severity={status.ok ? 'success' : 'error'}>{status.message}</Alert>
        )}
      </Box>
    </Container>
  );
}