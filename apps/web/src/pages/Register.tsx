import { useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  registerUser,
  saveAuthData,
} from "../services/authService";

function Register() {
  const navigate = useNavigate();

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [role, setRole] =
    useState("CITIZEN");

  const [governmentId, setGovernmentId] =
    useState("");

  const [verificationCode, setVerificationCode] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    /*
     * ---------------------------------------------------------------
     * BASIC VALIDATION
     * ---------------------------------------------------------------
     */

    if (!name.trim()) {
      setError(
        "Please enter your full name."
      );
      return;
    }

    if (!email.trim()) {
      setError(
        "Please enter your email address."
      );
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must contain at least 8 characters."
      );
      return;
    }

    if (
      password !== confirmPassword
    ) {
      setError(
        "Passwords do not match."
      );
      return;
    }

    /*
     * ---------------------------------------------------------------
     * GOVERNMENT OFFICER VALIDATION
     * ---------------------------------------------------------------
     */

    if (
      role ===
      "GOVERNMENT_OFFICER"
    ) {
      if (!governmentId.trim()) {
        setError(
          "Government ID is required for Government Officer registration."
        );
        return;
      }

      if (
        !verificationCode.trim()
      ) {
        setError(
          "Government verification code is required."
        );
        return;
      }
    }

    setIsLoading(true);

    try {
      const response =
        await registerUser(
          name.trim(),
          email.trim(),
          password,
          role,
          role ===
            "GOVERNMENT_OFFICER"
            ? governmentId.trim()
            : undefined,
          role ===
            "GOVERNMENT_OFFICER"
            ? verificationCode.trim()
            : undefined
        );

      saveAuthData(
        response.token,
        response.user
      );

      navigate("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed"
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleRoleChange(
    value: string
  ) {
    setRole(value);

    /*
     * Clear officer credentials
     * when switching away from
     * Government Officer.
     */

    if (
      value !==
      "GOVERNMENT_OFFICER"
    ) {
      setGovernmentId("");
      setVerificationCode("");
    }

    setError("");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-logo">
            3D
          </div>

          <div>
            <h1>3D ULPIN</h1>

            <p>
              Digital Cadastral Platform
            </p>
          </div>
        </div>

        {/* Heading */}
        <div className="auth-heading">
          <h2>
            Create your account
          </h2>

          <p>
            Register to access the
            3D property platform.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
        >

          {/* Full Name */}
          <label
            className="auth-label"
            htmlFor="register-name"
          >
            Full name
          </label>

          <input
            id="register-name"
            className="auth-input"
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={(event) =>
              setName(
                event.target.value
              )
            }
            required
          />

          {/* Email */}
          <label
            className="auth-label"
            htmlFor="register-email"
          >
            Email address
          </label>

          <input
            id="register-email"
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
            required
          />

          {/* Account Type */}
          <label
            className="auth-label"
            htmlFor="register-role"
          >
            Account type
          </label>

          <select
            id="register-role"
            className="auth-input"
            value={role}
            onChange={(event) =>
              handleRoleChange(
                event.target.value
              )
            }
          >
            <option value="CITIZEN">
              Citizen
            </option>

            <option value="SURVEYOR">
              Surveyor
            </option>

            <option value="GOVERNMENT_OFFICER">
              Government Officer
            </option>
          </select>

          {/* Government Officer Verification */}
          {role ===
            "GOVERNMENT_OFFICER" && (
            <div
              className="government-verification"
            >

              <div className="government-verification-header">
                <span className="government-verification-icon">
                  🛡
                </span>

                <div>
                  <strong>
                    Government verification
                  </strong>

                  <p>
                    Valid government
                    credentials are
                    required.
                  </p>
                </div>
              </div>

              {/* Government ID */}
              <label
                className="auth-label"
                htmlFor="government-id"
              >
                Government ID
              </label>

              <input
                id="government-id"
                className="auth-input"
                type="text"
                placeholder="Enter your government ID"
                value={
                  governmentId
                }
                onChange={(
                  event
                ) =>
                  setGovernmentId(
                    event.target
                      .value
                  )
                }
                required
              />

              {/* Verification Code */}
              <label
                className="auth-label"
                htmlFor="verification-code"
              >
                Verification code
              </label>

              <input
                id="verification-code"
                className="auth-input"
                type="password"
                placeholder="Enter verification code"
                value={
                  verificationCode
                }
                onChange={(
                  event
                ) =>
                  setVerificationCode(
                    event.target
                      .value
                  )
                }
                required
              />

              <div className="government-verification-note">
                Your Government ID and
                verification credentials
                will be validated against
                the authorized government
                registry.
              </div>

            </div>
          )}

          {/* Password */}
          <label
            className="auth-label"
            htmlFor="register-password"
          >
            Password
          </label>

          <input
            id="register-password"
            className="auth-input"
            type="password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            required
          />

          {/* Confirm Password */}
          <label
            className="auth-label"
            htmlFor="register-confirm-password"
          >
            Confirm password
          </label>

          <input
            id="register-confirm-password"
            className="auth-input"
            type="password"
            placeholder="Repeat your password"
            value={
              confirmPassword
            }
            onChange={(event) =>
              setConfirmPassword(
                event.target.value
              )
            }
            required
          />

          {/* Error */}
          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            className="auth-submit"
            type="submit"
            disabled={isLoading}
          >
            {isLoading
              ? "Verifying & Creating..."
              : "Create Account"}
          </button>

        </form>

        {/* Footer */}
        <div className="auth-footer">
          Already have an account?{" "}

          <Link to="/login">
            Sign in
          </Link>
        </div>

      </div>
    </div>
  );
}

export default Register;