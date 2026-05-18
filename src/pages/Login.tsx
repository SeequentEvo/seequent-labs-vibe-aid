import { startLogin } from "@/api/auth";

export default function Login() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Vibe Aid</h1>
        <p className="text-gray-500 text-sm mb-8">
          Seequent Labs — Geoscience Web App Template
        </p>
        <p className="text-gray-600 mb-6">
          Sign in with your Bentley account to continue.
        </p>
        <button
          onClick={() => void startLogin()}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
