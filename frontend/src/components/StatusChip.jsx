import { Chip } from '@mui/material';

const statusColors = {
  Draft: 'default',
  Quotation: 'info',
  Confirmed: 'primary',
  Active: 'success',
  Closed: 'default',
  Paid: 'success',
  Cancelled: 'error',
  Overdue: 'error',
  Paused: 'warning',
};

export default function StatusChip({ status, label, color, ...props }) {
  return (
    <Chip
      size="small"
      label={label || status}
      color={color || statusColors[status] || 'default'}
      sx={{ textTransform: 'capitalize' }}
      {...props}
    />
  );
}
