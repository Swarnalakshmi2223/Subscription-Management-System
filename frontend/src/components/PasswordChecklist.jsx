import { Box, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { passwordRules } from '../utils/password';

export default function PasswordChecklist({ password }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
      {passwordRules.map((rule) => {
        const ok = rule.test(password);
        const Icon = ok ? CheckCircleIcon : RadioButtonUncheckedIcon;
        return (
          <Box key={rule.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: ok ? 'success.main' : 'text.secondary' }}>
            <Icon sx={{ fontSize: 16 }} />
            <Typography variant="caption">{rule.label}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}