import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import ViewModuleOutlined from '@mui/icons-material/ViewModuleOutlined';

export const navItems = [
  { label: 'Dashboard', to: '/', icon: SpaceDashboardOutlined, roles: ['admin', 'staff', 'customer'], end: true },
  { label: 'Users', to: '/users', icon: PeopleAltOutlined, roles: ['admin'] },
  { label: 'Customers', to: '/users', icon: PeopleAltOutlined, roles: ['staff'] },
  { label: 'Taxes', to: '/taxes', icon: AccountBalanceOutlined, roles: ['admin', 'staff'] },
  { label: 'Products', to: '/products', icon: Inventory2Outlined, roles: ['admin', 'staff'] },
  { label: 'Plans', to: '/plans', icon: ViewModuleOutlined, roles: ['admin', 'staff'] },
];

export const roleColor = { admin: 'primary', staff: 'info', customer: 'default' };

export const isNavItemActive = (item, pathname) => (
  item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`)
);
