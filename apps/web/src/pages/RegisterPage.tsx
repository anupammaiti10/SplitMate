import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ValidationRule {
  test: (v: string) => boolean;
  message: string;
}

const passwordRules: ValidationRule[] = [
  { test: (v) => v.length >= 8, message: "At least 8 characters" },
  { test: (v) => /[A-Z]/.test(v), message: "One uppercase letter" },
  { test: (v) => /[a-z]/.test(v), message: "One lowercase letter" },
  { test: (v) => /[0-9]/.test(v), message: "One number" },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, isRegistering } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);
  const [serverError, setServerError] = useState("");

  const validate = () => {
    const newErrors: { field?: string; message: string }[] = [];

    if (!name.trim()) {
      newErrors.push({ field: "name", message: "Name is required" });
    }

    if (!email.trim()) {
      newErrors.push({ field: "email", message: "Email is required" });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.push({ field: "email", message: "Enter a valid email address" });
    }

    if (!password) {
      newErrors.push({ field: "password", message: "Password is required" });
    } else {
      for (const rule of passwordRules) {
        if (!rule.test(password)) {
          newErrors.push({ field: "password", message: rule.message });
          break;
        }
      }
    }

    if (!confirmPassword) {
      newErrors.push({ field: "confirmPassword", message: "Please confirm your password" });
    } else if (password !== confirmPassword) {
      newErrors.push({ field: "confirmPassword", message: "Passwords do not match" });
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const getFieldError = (field: string) =>
    errors.find((e) => e.field === field)?.message;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    try {
      await register({ name: name.trim(), email: email.trim(), password });
      navigate("/dashboard");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Registration failed. Please try again.";
      setServerError(msg);
    }
  };

  const passwordChecks = passwordRules.map((rule) => ({
    label: rule.message,
    met: rule.test(password),
  }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Create an account</h1>
            <p className="text-gray-500 mt-1">Start splitting expenses with friends</p>
          </div>

          {serverError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                  getFieldError("name")
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
                placeholder="Your name"
              />
              {getFieldError("name") && (
                <p className="mt-1 text-xs text-red-600">{getFieldError("name")}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                  getFieldError("email")
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
                placeholder="you@example.com"
              />
              {getFieldError("email") && (
                <p className="mt-1 text-xs text-red-600">{getFieldError("email")}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                  getFieldError("password")
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
                placeholder="Create a password"
              />
              {getFieldError("password") && (
                <p className="mt-1 text-xs text-red-600">{getFieldError("password")}</p>
              )}
              {password.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {passwordChecks.map((check) => (
                    <span
                      key={check.label}
                      className={`text-xs ${check.met ? "text-green-600" : "text-gray-400"}`}
                    >
                      {check.met ? "\u2713" : "\u25CB"} {check.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                  getFieldError("confirmPassword")
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
                placeholder="Re-enter your password"
              />
              {getFieldError("confirmPassword") && (
                <p className="mt-1 text-xs text-red-600">{getFieldError("confirmPassword")}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isRegistering}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isRegistering ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="text-indigo-600 font-medium hover:text-indigo-500">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
