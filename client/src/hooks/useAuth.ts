import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface User {
  _id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  profileImageUrl?: string;
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface RegisterCredentials extends LoginCredentials {
  firstName?: string;
  lastName?: string;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ['user'],
    queryFn: async () => {
      console.log('Fetching user data...');
      const response = await fetch(`${API_URL}/api/auth/user`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Auth user fetch failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        if (response.status === 401) {
          queryClient.setQueryData(['user'], null);
          return null;
        }
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const userData = await response.json();
      console.log('User data fetched successfully:', {
        userId: userData._id,
        username: userData.username
      });
      return userData;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const login = useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      console.log('Attempting login...');
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Login failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Login successful:', {
        userId: data._id,
        username: data.username
      });
      return data;
    },
    onSuccess: (data) => {
      console.log('Login mutation successful, updating cache...');
      queryClient.setQueryData(['user'], data.user || data);
      setLocation('/chat');
    },
    onError: (error) => {
      console.error('Login mutation failed:', error);
      queryClient.setQueryData(['user'], null);
    }
  });

  const register = useMutation({
    mutationFn: async (credentials: RegisterCredentials) => {
      console.log('Attempting registration...');
      const response = await fetch(`${API_URL}/api/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Registration failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Registration successful:', {
        userId: data._id,
        username: data.username
      });
      return data;
    },
    onSuccess: (data) => {
      console.log('Registration mutation successful, updating cache...');
      queryClient.setQueryData(['user'], data.user || data);
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setLocation('/chat');
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      console.log('Attempting logout...');
      const response = await fetch(`${API_URL}/api/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Logout failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      console.log('Logout successful');
    },
    onSuccess: () => {
      console.log('Logout mutation successful, clearing cache...');
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setLocation('/');
    },
  });

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  };
}