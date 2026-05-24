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
            {/* Instance root — redirect to persisted instance or show picker */}
            <Route index element={<InstancePicker />} />

            {/* Instance-scoped routes */}
            <Route path=":instanceId" element={<InstanceGuard />}>
              <Route index element={<Navigate to="workspaces" replace />} />
              <Route element={<Layout />}>
                <Route path="workspaces" element={<Workspaces />} />
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
