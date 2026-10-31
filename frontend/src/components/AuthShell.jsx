import { Box, Stack, Typography } from "@mui/material";

import LoopIcon from "@mui/icons-material/Loop";



const points = [
  'Plans, variants and quotation templates',
  'Automatic recurring invoices with tax',
  'Discounts that apply on their own',
  'Payments, overdue tracking and revenue reports',
];

export default function AuthShell({ title, subtitle, children }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'center',
          p: 8,
          color: '#fff',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        }}
      >
       <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 6 }}>
          <LoopIcon sx={{ fontSize: 40 }} />
          <Typography variant="h5">Brightloop</Typography>
        </Stack>
        <Typography variant="h3" fontWeight={700} sx={{ mb: 2, letterSpacing: '-0.02em' }}>
          Run every subscription from one place.
        </Typography>
        <Typography sx={{ opacity: 0.85, mb: 5, maxWidth: 460 }}>
          From plans and quotes to invoices, payments and revenue, without spreadsheets.
        </Typography>
        <Stack spacing={1.5}>
          {points.map((p) => (
            <Stack key={p} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
  <Typography sx={{ fontSize: 20, opacity: 0.9 }}>
    ✓
  </Typography>
  <Typography>{p}</Typography>
</Stack>
          ))}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default' }}>
        <Box sx={{ width: '100%', maxWidth: 440 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 4, display: { md: 'none' }, color: 'primary.main' }}>
            <LoopIcon />
            <Typography variant="h6">Brightloop</Typography>
          </Stack>
          <Typography variant="h4">{title}</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
            {subtitle}
          </Typography>
          {children}
        </Box>
      </Box>
    </Box>
  );
}