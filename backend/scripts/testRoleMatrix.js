import 'dotenv/config';

const baseUrl = (process.env.TEST_BASE_URL || '').replace(/\/$/, '');
const roles = [
  ['admin', process.env.TEST_ADMIN_TOKEN],
  ['staff', process.env.TEST_STAFF_TOKEN],
  ['customer', process.env.TEST_CUSTOMER_TOKEN],
  ['anonymous', null],
];
const id = '000000000000000000000001';
const body = '{}';

const routes = [
  { method: 'GET', path: '/api/health', public: true },
  { method: 'POST', path: '/api/auth/register', public: true },
  { method: 'POST', path: '/api/auth/login', public: true },
  { method: 'POST', path: '/api/auth/forgot-password', public: true },
  { method: 'POST', path: '/api/auth/reset-password', public: true },
  { method: 'GET', path: '/api/auth/me', roles: ['admin', 'staff', 'customer'] },
  { method: 'PATCH', path: '/api/auth/profile', roles: ['admin', 'staff', 'customer'] },
  { method: 'POST', path: '/api/users/staff', roles: ['admin'] },
  { method: 'GET', path: '/api/users/', roles: ['admin', 'staff'] },
  { method: 'PATCH', path: `/api/users/${id}/active`, roles: ['admin'] },
  ...['taxes', 'products', 'plans', 'quotation-templates'].flatMap((resource) => [
    { method: 'GET', path: `/api/${resource}/`, roles: ['admin', 'staff'] },
    { method: 'GET', path: `/api/${resource}/${id}`, roles: ['admin', 'staff'] },
    { method: 'POST', path: `/api/${resource}/`, roles: ['admin'] },
    { method: 'PUT', path: `/api/${resource}/${id}`, roles: ['admin'] },
    { method: 'PATCH', path: `/api/${resource}/${id}/active`, roles: ['admin'] },
  ]),
  { method: 'GET', path: '/api/subscriptions/', roles: ['admin', 'staff', 'customer'] },
  { method: 'GET', path: `/api/subscriptions/${id}`, roles: ['admin', 'staff', 'customer'] },
  { method: 'POST', path: '/api/subscriptions/preview', roles: ['admin', 'staff'] },
  { method: 'POST', path: '/api/subscriptions/', roles: ['admin', 'staff'] },
  { method: 'PUT', path: `/api/subscriptions/${id}`, roles: ['admin', 'staff'] },
  ...['send-quotation', 'confirm', 'activate', 'pause', 'resume', 'close', 'renew'].map((action) => ({
    method: 'PATCH', path: `/api/subscriptions/${id}/${action}`, roles: ['admin', 'staff'],
  })),
  { method: 'GET', path: '/api/discounts/', roles: ['admin', 'staff'] },
  { method: 'GET', path: `/api/discounts/${id}`, roles: ['admin', 'staff'] },
  { method: 'POST', path: '/api/discounts/', roles: ['admin'] },
  { method: 'PUT', path: `/api/discounts/${id}`, roles: ['admin'] },
  { method: 'PATCH', path: `/api/discounts/${id}/active`, roles: ['admin'] },
  { method: 'GET', path: '/api/invoices/', roles: ['admin', 'staff', 'customer'] },
  { method: 'GET', path: `/api/invoices/${id}`, roles: ['admin', 'staff', 'customer'] },
  { method: 'POST', path: '/api/invoices/generate', roles: ['admin', 'staff'] },
  ...['confirm', 'cancel'].map((action) => ({
    method: 'PATCH', path: `/api/invoices/${id}/${action}`, roles: ['admin', 'staff'],
  })),
  { method: 'POST', path: `/api/invoices/${id}/send`, roles: ['admin', 'staff'] },
  { method: 'POST', path: '/api/billing/run', roles: ['admin'] },
  { method: 'GET', path: '/api/payments/', roles: ['admin', 'staff', 'customer'] },
  { method: 'GET', path: `/api/payments/${id}`, roles: ['admin', 'staff', 'customer'] },
  { method: 'POST', path: '/api/payments/', roles: ['admin', 'staff'] },
  ...['summary', 'revenue', 'overdue'].map((report) => ({
    method: 'GET', path: `/api/reports/${report}`, roles: ['admin', 'staff'],
  })),
];

const allowedStatuses = new Set([200, 201, 400, 404, 409, 422]);

const request = async (role, route) => {
  const token = roles.find(([name]) => name === role)?.[1];
  const response = await fetch(`${baseUrl}${route.path}`, {
    method: route.method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(route.method === 'POST' || route.method === 'PUT' || route.method === 'PATCH'
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body: route.method === 'GET' ? undefined : body,
    signal: AbortSignal.timeout(10000),
  });
  return response.status;
};

if (!baseUrl || !process.env.TEST_ADMIN_TOKEN || !process.env.TEST_STAFF_TOKEN || !process.env.TEST_CUSTOMER_TOKEN) {
  console.log('ROLE_MATRIX_SKIPPED: set TEST_BASE_URL and all three TEST_*_TOKEN values to run the HTTP matrix.');
  process.exit(0);
}

const results = [];
for (const route of routes) {
  for (const [role] of roles) {
    const status = await request(role, route);
    const expected = route.public
      ? 'public'
      : route.roles.includes(role)
        ? 'allowed'
        : 'forbidden';
    const passed = route.public
      ? allowedStatuses.has(status) && status !== 401 && status !== 403
      : expected === 'allowed'
        ? allowedStatuses.has(status)
        : status === (role === 'anonymous' ? 401 : 403);
    results.push({ role, method: route.method, path: route.path, status, expected, passed });
  }
}

const failures = results.filter((result) => !result.passed);
console.log(JSON.stringify({ testedRoutes: routes.length, roleChecks: results.length, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
else console.log('Role matrix passed for admin, staff, customer, and anonymous access.');
