import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, Chip, InputAdornment, LinearProgress, Snackbar, Stack, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PageHeader from '../../components/PageHeader';
import AddStaffDialog from './AddStaffDialog';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { apiError } from '../../utils/errors';
import { roleColor } from '../../components/navigation';

export default function Users() {
  const { user: me } = useAuth();
  const isAdmin = me.role === 'admin';

  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page: page + 1, limit, search: query || undefined };
      if (isAdmin && role !== 'all') params.role = role;
      const { data } = await api.get('/users', { params });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load users').message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, query, role, isAdmin]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const toggleActive = async (u) => {
    try {
      await api.patch(`/users/${u._id}/active`, { isActive: !u.isActive });
      setToast({ severity: 'success', message: `${u.name} ${u.isActive ? 'deactivated' : 'activated'}` });
      load();
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err).message });
    }
  };

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Users' : 'Customers'}
        subtitle={isAdmin ? 'Staff and customer accounts' : 'Customer accounts'}
        action={
          isAdmin && (
            <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => setDialogOpen(true)}>
              Add staff
            </Button>
          )
        }
      />

      <Card>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ p: 2, justifyContent: 'space-between', alignItems: { md: 'center' } }}>
          {isAdmin ? (
            <Tabs value={role} onChange={(e, v) => { setRole(v); setPage(0); }}>
              <Tab value="all" label="All" />
              <Tab value="staff" label="Staff" />
              <Tab value="customer" label="Customers" />
            </Tabs>
          ) : (
            <Box />
          )}
          <TextField
            size="small"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ maxWidth: { md: 320 } }}
            slotProps={{ input: { startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>) } }}
          />
        </Stack>
        {loading && <LinearProgress />}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Joined</TableCell>
                {isAdmin && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u._id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>{u.name.charAt(0).toUpperCase()}</Avatar>
                      <Typography fontWeight={600}>{u.name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip size="small" label={u.role} color={roleColor[u.role]} sx={{ textTransform: 'capitalize' }} />
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={u.isActive ? 'Active' : 'Inactive'} color={u.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  {isAdmin && (
                    <TableCell align="right">
                      {u._id === me._id ? (
                        <Typography variant="body2" color="text.secondary">You</Typography>
                      ) : (
                        <Button size="small" variant="outlined" color={u.isActive ? 'error' : 'success'} onClick={() => toggleActive(u)}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={limit}
          onRowsPerPageChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Card>

      <AddStaffDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false);
          setToast({ severity: 'success', message: 'Staff account created' });
          load();
        }}
      />

      <Snackbar open={Boolean(toast)} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">{toast.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
}
