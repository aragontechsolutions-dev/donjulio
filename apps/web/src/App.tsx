import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./landing/LandingPage";
import AdminLogin from "./admin/AdminLogin";
import AdminLayout from "./admin/AdminLayout";
import Dashboard from "./admin/pages/Dashboard";
import ProductosAdmin from "./admin/pages/ProductosAdmin";
import PedidosAdmin from "./admin/pages/PedidosAdmin";
import PromocionesAdmin from "./admin/pages/PromocionesAdmin";
import CmsAdmin from "./admin/pages/CmsAdmin";
import { useAuth } from "./lib/auth";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-crust-500">
        Cargando…
      </div>
    );
  }
  return user ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="productos" element={<ProductosAdmin />} />
        <Route path="pedidos" element={<PedidosAdmin />} />
        <Route path="promociones" element={<PromocionesAdmin />} />
        <Route path="cms" element={<CmsAdmin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
