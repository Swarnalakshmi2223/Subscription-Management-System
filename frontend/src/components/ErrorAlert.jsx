import { Alert } from '@mui/material';

export default function ErrorAlert({ error, sx }) {
  if (!error) return null;
  return (
    <Alert severity="error" sx={sx}>
      {error.message}
      {error.details?.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {error.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}