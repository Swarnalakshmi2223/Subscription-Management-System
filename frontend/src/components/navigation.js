import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined';

export const navItems = [
  { label: 'Dashboard', to: '/', icon: SpaceDashboardOutlined, roles: ['admin', 'staff', 'customer'], end: true },
  { label: 'Users', to: '/users', icon: PeopleAltOutlined, roles: ['admin'] },
  { label: 'Customers', to: '/users', icon: PeopleAltOutlined, roles: ['staff'] },
];

export const roleColor = { admin: 'primary', staff: 'info', customer: 'default' };