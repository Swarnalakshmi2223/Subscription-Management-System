import { Box, Stack, Typography } from '@mui/material';

export default function PageHeader({ title, subtitle, action }) {
  return (
   <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
      <Box>
        <Typography variant="h5">{title}</Typography>
        {subtitle && <Typography color="text.secondary">{subtitle}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}