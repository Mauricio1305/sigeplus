import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export const ProtectedRoute = ({ children, requireSuperAdmin = false }: { children: React.ReactNode, requireSuperAdmin?: boolean }) => {
  const user = useAuthStore(state => state.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireSuperAdmin && user.perfil !== 'superadmin') {
    return <Navigate to="/dashboard" replace />;
  }

  // Check subscription for non-superadmins
  if (user.perfil !== 'superadmin') {
    let daysSinceExpiration = -1;
    if (user.vencimento_assinatura) {
      const expirationDate = new Date(user.vencimento_assinatura);
      const today = new Date();
      daysSinceExpiration = Math.floor((today.getTime() - expirationDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    const isExpired = user.status_assinatura === 'cancelado' || daysSinceExpiration > 10;
    
    if (isExpired && location.pathname !== '/subscription') {
      return <Navigate to="/subscription" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
