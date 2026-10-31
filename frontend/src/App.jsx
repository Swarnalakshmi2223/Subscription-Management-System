
import { Navigate, Route, Routes } from 'react-router-dom';

import ProtectedRoute, { GuestRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

import Dashboard from './pages/Dashboard';
import Users from './pages/users/Users';
import Taxes from './pages/catalog/Taxes';
import Products from './pages/catalog/Products';
import Plans from './pages/catalog/Plans';
import QuotationTemplates from './pages/catalog/QuotationTemplates';
import Discounts from './pages/catalog/Discounts';
import Subscriptions from './pages/subscriptions/Subscriptions';
import SubscriptionCreate from './pages/subscriptions/SubscriptionCreate';
import SubscriptionDetail from './pages/subscriptions/SubscriptionDetail';

export default function App() {
  return (
    <Routes>
      {/* Authentication Routes */}
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />

      <Route
        path="/forgot-password"
        element={<GuestRoute><ForgotPassword /></GuestRoute>}
      />

      <Route
        path="/reset-password"
        element={<ResetPassword />}
      />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />

          <Route element={<ProtectedRoute roles={['admin', 'staff']} />}>
            <Route path="users" element={<Users />} />
            <Route path="taxes" element={<Taxes />} />
            <Route path="products" element={<Products />} />
            <Route path="plans" element={<Plans />} />
            <Route path="quotation-templates" element={<QuotationTemplates />} />
            <Route path="discounts" element={<Discounts />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin', 'staff', 'customer']} />}>
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="subscriptions/new" element={<SubscriptionCreate />} />
            <Route path="subscriptions/:id" element={<SubscriptionDetail />} />
          </Route>
        </Route>
      </Route>

      {/* Default Route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
