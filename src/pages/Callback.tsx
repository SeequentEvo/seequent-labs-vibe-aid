import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/hooks/useStore";
import { handleCallback, selectAuthStatus, selectAuthError } from "@/store/authSlice";

export default function Callback() {
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const status = useAppSelector(selectAuthStatus);
  const error = useAppSelector(selectAuthError);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      const description = searchParams.get("error_description") ?? oauthError;
      navigate(`/error?message=${encodeURIComponent(description)}`, { replace: true });
      return;
    }

    if (!code || !state) {
      navigate("/error?message=Missing+authorization+code+or+state", { replace: true });
      return;
    }

    void dispatch(handleCallback({ code, state }));
  }, [searchParams, dispatch, navigate]);

  useEffect(() => {
    if (status === "authenticated") {
      navigate("/", { replace: true });
    }
  }, [status, navigate]);

  if (status === "error") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Authentication Failed
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/login"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">Signing in…</div>
    </div>
  );
}
