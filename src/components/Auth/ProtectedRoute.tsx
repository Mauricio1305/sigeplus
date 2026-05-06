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
    const isExpired = user.status_assinatura !== 'ativo' || (user.vencimento_assinatura && new Date(user.vencimento_assinatura) < new Date());
    if (isExpired && location.pathname !== '/subscription') {
      return <Navigate to="/subscription" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
