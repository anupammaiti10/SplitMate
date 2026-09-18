import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { setTokens, clearTokens, getAccessToken } from "@/lib/api";
import { User, ApiResponse } from "@/types";

export function useAuth() {
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ["user", "me"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<User>>("/users/me");
      return response.data.data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: !!getAccessToken(),
  });

  const loginMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      const response = await api.post<
        ApiResponse<{ user: User; accessToken: string; refreshToken: string }>
      >("/auth/login", { email, password });
      return response.data.data;
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      queryClient.setQueryData(["user", "me"], data.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }) => {
      const response = await api.post<
        ApiResponse<{ user: User; accessToken: string; refreshToken: string }>
      >("/auth/register", { name, email, password });
      return response.data.data;
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      queryClient.setQueryData(["user", "me"], data.user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post("/auth/logout");
    },
    onSettled: () => {
      clearTokens();
      queryClient.setQueryData(["user", "me"], null);
      queryClient.clear();
    },
  });

  return {
    user: userQuery.data,
    isLoading: userQuery.isLoading,
    isAuthenticated: userQuery.isSuccess && !!userQuery.data,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
