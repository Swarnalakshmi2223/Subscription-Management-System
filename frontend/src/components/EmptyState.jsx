import InboxOutlined from '@mui/icons-material/InboxOutlined';
import { Box, Button, Stack, Typography } from '@mui/material';

export default function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
  actionLabel,
  onAction,
}) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', py: 7, px: 2, textAlign: 'center' }}>
      <Box sx={{ color: 'text.disabled', display: 'flex' }}>
        <InboxOutlined sx={{ fontSize: 48 }} />
      </Box>
      <Typography variant="h6">{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ maxWidth: 480 }}>{description}</Typography>}
      {action || (actionLabel && <Button variant="contained" onClick={onAction}>{actionLabel}</Button>)}
    </Stack>
  );
}
