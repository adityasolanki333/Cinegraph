import { useAuthContext } from "@/contexts/AuthContext";

interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  profileImageUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth(): AuthState {
  const { user, isLoading, isAuthenticated } = useAuthContext();
  return { user, isLoading, isAuthenticated };
}

export async function register(email: string, password: string, firstName: string, lastName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password, firstName, lastName }),
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.removeItem('demo-mode');
      localStorage.removeItem('demo-user');
      window.dispatchEvent(new CustomEvent('auth-change'));
      return { success: true };
    } else {
      return { success: false, error: data.error || 'Registration failed' };
    }
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

export async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.removeItem('demo-mode');
      localStorage.removeItem('demo-user');
      console.log('[Login] Dispatching auth-change event');
      window.dispatchEvent(new CustomEvent('auth-change'));
      return { success: true };
    } else {
      return { success: false, error: data.error || 'Login failed' };
    }
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

export async function demoLogin(): Promise<{ success: boolean; error?: string }> {
  try {
    const demoUser = {
      id: 'demo_user',
      email: 'demo@movieapp.com',
      firstName: 'Demo',
      lastName: 'User',
      bio: 'Demo user for testing the application',
      profileImageUrl: null,
      createdAt: new Date().toISOString(),
    };
    
    localStorage.setItem('demo-mode', 'true');
    localStorage.setItem('demo-user', JSON.stringify(demoUser));
    
    console.log('[Demo Login] Demo mode enabled with localStorage');
    window.dispatchEvent(new CustomEvent('auth-change'));
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Demo login failed' };
  }
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    console.error('Logout error:', error);
  }
  
  localStorage.removeItem('demo-mode');
  localStorage.removeItem('demo-user');
  
  window.dispatchEvent(new CustomEvent('auth-change'));
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function getAuthToken(): string | null {
  return null;
}
