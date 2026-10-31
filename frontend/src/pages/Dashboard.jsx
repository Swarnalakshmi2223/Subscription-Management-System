import { Card, CardContent, Stack, Typography } from '@mui/material';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';

const abilities = {
  admin: ['Create staff accounts', 'Manage products, plans, taxes and discounts', 'Oversee subscriptions, invoices and payments', 'View finance reports'],
  staff: ['Look after customers', 'Create quotations and subscriptions', 'Confirm, send and print invoices', 'Record payments'],
  customer: ['View your own subscriptions', 'View and print your own invoices', 'Track upcoming renewals'],
};

export default function Dashboard() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle="Here is what you can do with your account." />
      <Card sx={{ maxWidth: 640 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.5, textTransform: 'capitalize' }}>
            {user.role} access
          </Typography>
          <Stack spacing={1}>
            {abilities[user.role].map((a) => (
              <Typography key={a} color="text.secondary">• {a}</Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}