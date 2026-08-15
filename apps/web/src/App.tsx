import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./landing/LandingPage";
import Autoservicio from "./autoservicio/Autoservicio";
import Fichaje from "./fichaje/Fichaje";
import AdminLogin from "./admin/AdminLogin";
import AdminLayout from "./admin/AdminLayout";
import Dashboard from "./admin/pages/Dashboard";
import ProductosAdmin from "./admin/pages/ProductosAdmin";
import PedidosAdmin from "./admin/pages/PedidosAdmin";
import EncargosAdmin from "./admin/pages/EncargosAdmin";
import PromocionesAdmin from "./admin/pages/PromocionesAdmin";
import CmsAdmin from "./admin/pages/CmsAdmin";
import InsumosAdmin from "./admin/pages/InsumosAdmin";
import RecetasAdmin from "./admin/pages/RecetasAdmin";
import ProduccionAdmin from "./admin/pages/ProduccionAdmin";
import MermasAdmin from "./admin/pages/MermasAdmin";
import TrazabilidadAdmin from "./admin/pages/TrazabilidadAdmin";
import CajaAdmin from "./admin/pages/CajaAdmin";
import ReportesAdmin from "./admin/pages/ReportesAdmin";
import SalonAdmin from "./admin/pages/SalonAdmin";
import KdsAdmin from "./admin/pages/KdsAdmin";
import ReservasAdmin from "./admin/pages/ReservasAdmin";
import TurnosAdmin from "./admin/pages/TurnosAdmin";
import UsuariosAdmin from "./admin/pages/UsuariosAdmin";
import ChangePassword from "./admin/ChangePassword";
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
  if (!user) return <Navigate to="/admin/login" replace />;
  // Fuerza el cambio de contraseña en el primer login / tras un reset.
  if (user.mustChangePassword) return <ChangePassword />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/mesa/:token" element={<Autoservicio />} />
      <Route path="/fichaje/:token" element={<Fichaje />} />
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
        <Route path="encargos" element={<EncargosAdmin />} />
        <Route path="promociones" element={<PromocionesAdmin />} />
        <Route path="cms" element={<CmsAdmin />} />
        <Route path="insumos" element={<InsumosAdmin />} />
        <Route path="recetas" element={<RecetasAdmin />} />
        <Route path="produccion" element={<ProduccionAdmin />} />
        <Route path="mermas" element={<MermasAdmin />} />
        <Route path="trazabilidad" element={<TrazabilidadAdmin />} />
        <Route path="caja" element={<CajaAdmin />} />
        <Route path="reportes" element={<ReportesAdmin />} />
        <Route path="salon" element={<SalonAdmin />} />
        <Route path="kds" element={<KdsAdmin />} />
        <Route path="reservas" element={<ReservasAdmin />} />
        <Route path="turnos" element={<TurnosAdmin />} />
        <Route path="usuarios" element={<UsuariosAdmin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
