import { useCallback, useEffect, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import EditOutlined from '@mui/icons-material/EditOutlined';
import PowerSettingsNewOutlined from '@mui/icons-material/PowerSettingsNewOutlined';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { apiError } from '../../utils/errors';

const emptyForm = { name: '', ratePercent: '' };

export default function Taxes() {
  const { user } = useAuth();
  const canEdit = user.role === 'admin';
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/taxes', { params: { page: page + 1, limit } });
      setItems(data.items);
      setTotal(data.meta.total);
    } catch (err) {
      setError(apiError(err, 'Failed to load taxes'));
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (tax) => {
    setEditing(tax);
    setForm({ name: tax.name, ratePercent: String(tax.ratePercent) });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!saving) setDialogOpen(false);
  };

  const save = async (event) => {
    event.preventDefault();
    const rate = Number(form.ratePercent);
    if (!form.name.trim()) {
      setFormError({ message: 'Tax name is required' });
      return;
    }
    if (form.ratePercent.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      setFormError({ message: 'Tax percentage must be between 0 and 100' });
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = { name: form.name.trim(), ratePercent: rate };
      if (editing) await api.put(`/taxes/${editing._id}`, payload);
      else await api.post('/taxes', payload);
      setDialogOpen(false);
      setToast({ severity: 'success', message: editing ? 'Tax updated' : 'Tax created' });
      load();
    } catch (err) {
      setFormError(apiError(err, 'Could not save the tax'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!confirming) return;
    const tax = confirming;
    try {
      await api.patch(`/taxes/${tax._id}/active`, { isActive: !tax.isActive });
      setConfirming(null);
      setToast({ severity: 'success', message: `${tax.name} ${tax.isActive ? 'deactivated' : 'activated'}` });
      load();
    } catch (err) {
      setToast({ severity: 'error', message: apiError(err).message });
    }
  };

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'ratePercent', label: 'Rate', render: (tax) => `${tax.ratePercent}%` },
    { key: 'status', label: 'Status', render: (tax) => <StatusChip status={tax.isActive ? 'Active' : 'Inactive'} color={tax.isActive ? 'success' : 'default'} /> },
    ...(canEdit ? [{
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (tax) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="Edit tax"><IconButton aria-label={`Edit ${tax.name}`} onClick={() => openEdit(tax)}><EditOutlined /></IconButton></Tooltip>
          <Tooltip title={tax.isActive ? 'Deactivate tax' : 'Activate tax'}>
            <IconButton aria-label={`${tax.isActive ? 'Deactivate' : 'Activate'} ${tax.name}`} onClick={() => setConfirming(tax)} color={tax.isActive ? 'error' : 'success'}>
              <PowerSettingsNewOutlined />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Taxes"
        subtitle="Manage the tax rates used when pricing subscription lines."
        action={canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add tax</Button>}
      />
      {error && <ErrorAlert error={error} sx={{ mb: 2 }} />}
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        emptyTitle="No taxes found"
        emptyDescription={canEdit ? 'Create a tax rate to use on products.' : 'No tax rates have been configured yet.'}
        aria-label="Taxes"
        pagination={{
          total,
          page,
          rowsPerPage: limit,
          onPageChange: (_event, nextPage) => setPage(nextPage),
          onRowsPerPageChange: (event) => { setLimit(Number(event.target.value)); setPage(0); },
        }}
      />

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="xs">
        <form onSubmit={save} noValidate>
          <DialogTitle>{editing ? 'Edit tax' : 'Add tax'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <ErrorAlert error={formError} />
              <TextField label="Tax name" name="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
              <TextField
                label="Rate percentage"
                name="ratePercent"
                type="number"
                value={form.ratePercent}
                onChange={(event) => setForm({ ...form, ratePercent: event.target.value })}
                required
                slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save tax'}</Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={`${confirming?.isActive ? 'Deactivate' : 'Activate'} tax?`}
        description={confirming ? `${confirming.name} will be ${confirming.isActive ? 'hidden from new product selections' : 'available for new product selections'}.` : undefined}
        confirmLabel={confirming?.isActive ? 'Deactivate' : 'Activate'}
        dangerous={confirming?.isActive}
        onClose={() => setConfirming(null)}
        onConfirm={toggleStatus}
      />

      <Snackbar open={Boolean(toast)} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast && <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.message}</Alert>}
      </Snackbar>
    </>
  );
}
