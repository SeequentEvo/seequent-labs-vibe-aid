import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./store";
import Layout from "./components/Layout";
import AuthGuard from "./components/AuthGuard";
import InstanceGuard from "./components/InstanceGuard";
import Workspaces from "./pages/Home";
import InstancePicker from "./pages/InstancePicker";
import Login from "./pages/Login";
import Callback from "./pages/Callback";
import Logout from "./pages/Logout";
import ErrorPage from "./pages/Error";

function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/error" element={<ErrorPage />} />

          {/* Authenticated routes */}
          <Route element={<AuthGuard />}>
            {/* Root — redirect to instance picker */}
            <Route index element={<Navigate to="/instances" replace />} />

            {/* Instance picker */}
            <Route path="instances" element={<InstancePicker />} />

            {/* Instance-scoped routes */}
            <Route path="instances/:instanceId" element={<InstanceGuard />}>
              <Route element={<Layout />}>
                <Route index element={<Workspaces />} />
              </Route>
            </Route>
          </Route>

          {/* Catch-all — redirect unknown paths to root */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}

export default App
