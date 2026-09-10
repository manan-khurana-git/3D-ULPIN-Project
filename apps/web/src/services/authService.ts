const API_BASE_URL = "http://localhost:5000/api";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

type AuthResponse = {
  status: string;
  message?: string;
  token: string;
  user: AuthUser;
};

/*
|--------------------------------------------------------------------------
| REGISTER USER
|--------------------------------------------------------------------------
*/

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role = "CITIZEN",
  governmentId?: string,
  verificationCode?: string
): Promise<AuthResponse> {
  const response = await fetch(
    `${API_BASE_URL}/auth/register`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        name,
        email,
        password,
        role,

        ...(role === "GOVERNMENT_OFFICER"
          ? {
              government_id:
                governmentId?.trim(),

              verification_code:
                verificationCode?.trim(),
            }
          : {}),
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
        "Registration failed"
    );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| LOGIN USER
|--------------------------------------------------------------------------
*/

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResponse> {
  const response = await fetch(
    `${API_BASE_URL}/auth/login`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        email,
        password,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
        "Login failed"
    );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| SAVE AUTH DATA
|--------------------------------------------------------------------------
*/

export function saveAuthData(
  token: string,
  user: AuthUser
) {
  localStorage.setItem(
    "ulpin_token",
    token
  );

  localStorage.setItem(
    "ulpin_user",
    JSON.stringify(user)
  );
}

/*
|--------------------------------------------------------------------------
| GET AUTH TOKEN
|--------------------------------------------------------------------------
*/

export function getAuthToken(): string | null {
  return localStorage.getItem(
    "ulpin_token"
  );
}

/*
|--------------------------------------------------------------------------
| GET AUTH USER
|--------------------------------------------------------------------------
*/

export function getAuthUser(): AuthUser | null {
  const storedUser =
    localStorage.getItem(
      "ulpin_user"
    );

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(
      storedUser
    ) as AuthUser;
  } catch {
    return null;
  }
}

/*
|--------------------------------------------------------------------------
| CLEAR AUTH DATA
|--------------------------------------------------------------------------
*/

export function clearAuthData() {
  localStorage.removeItem(
    "ulpin_token"
  );

  localStorage.removeItem(
    "ulpin_user"
  );
}

/*
|--------------------------------------------------------------------------
| AUTHENTICATION CHECK
|--------------------------------------------------------------------------
*/

export function isAuthenticated(): boolean {
  return Boolean(
    getAuthToken()
  );
}