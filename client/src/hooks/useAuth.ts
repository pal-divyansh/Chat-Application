import { useQuery } from "@tanstack/react-query";

const API_URL = '/api'; // Use relative URL to work with Vite proxy

export function useAuth() {
  const { 
    data: user, 
    isLoading, 
    refetch,
    error 
  } = useQuery({
    queryKey: ["auth/user"],
    queryFn: async () => {
      try {
        const response = await fetch(`${API_URL}/auth/user`, {
          method: 'GET',
          credentials: "include",
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        // If the response is not OK, we'll handle it below
        if (!response.ok) {
          // If we get a 401, it means the user is not authenticated
          if (response.status === 401) {
            return null;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Check if the response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          console.warn('Expected JSON response but got:', contentType);
          return null;
        }

        const data = await response.json();
        return data.user || data;
      } catch (error) {
        console.error("Auth check failed:", error);
        return null;
      }
    },
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    refetchUser: refetch,
  };
}