import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Box, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Stack, Toolbar, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import LoopIcon from '@mui/icons-material/Loop';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../context/AuthContext';
import { navItems, roleColor } from './navigation';

const DRAWER = 260;

export default function Layout() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);

  const items = navItems.filter((i) => i.roles.includes(user.role));

  const onLogout = () => {
    setAnchor(null);
    logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ gap: 1.5, px: 3, color: 'primary.main' }}>
        <LoopIcon />
        <Typography variant="h6" color="text.primary">Brightloop</Typography>
      </Toolbar>
      <List sx={{ px: 1.5, flex: 1 }}>
        {items.map((item) => {
          const Icon = item.icon;
          const selected = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
          return (
            <ListItemButton
              key={item.label}
              component={NavLink}
              to={item.to}
              selected={selected}
              onClick={() => setMobileOpen(false)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: '#fff',
                  '& .MuiListItemIcon-root': { color: '#fff' },
                  '&:hover': { bgcolor: 'primary.dark' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Icon />
              </ListItemIcon>
              <ListItemText primary={item.label} slotProps={{ primary: { fontWeight: 600 } }} />
            </ListItemButton>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Brightloop Software
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{ width: { md: `calc(100% - ${DRAWER}px)` }, ml: { md: `${DRAWER}px` }, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#fff' }}
      >
        <Toolbar>
          <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1, display: { md: 'none' } }} aria-label="open menu">
            <MenuIcon />
          </IconButton>
          <Box sx={{ flex: 1 }} />
         <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Chip label={user.role} color={roleColor[user.role]} size="small" sx={{ textTransform: 'capitalize' }} />
            <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="account menu">
              <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 16 }}>
                {user.name.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Stack>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography fontWeight={600}>{user.name}</Typography>
              <Typography variant="body2" color="text.secondary">{user.email}</Typography>
            </Box>
            <Divider />
            <MenuItem onClick={onLogout}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop ? true : mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box', borderRight: '1px solid', borderColor: 'divider' } }}
        >
          {sidebar}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}