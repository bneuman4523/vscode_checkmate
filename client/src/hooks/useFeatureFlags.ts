import { useQuery } from "@tanstack/react-query";

interface FeatureFlags {
  badgeFlipPreview: boolean;
  betaFeedback: boolean;
  penTestMode: boolean;
  kioskWalkinRegistration: boolean;
  groupCheckin: boolean;
  eventSync: boolean;
}

export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery<FeatureFlags>({
    queryKey: ["/api/settings/feature-flags"],
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  return {
    badgeFlipPreview: data?.badgeFlipPreview ?? false,
    betaFeedback: data?.betaFeedback ?? false,
    penTestMode: data?.penTestMode ?? false,
    kioskWalkinRegistration: data?.kioskWalkinRegistration ?? false,
    groupCheckin: data?.groupCheckin ?? false,
    eventSync: data?.eventSync ?? true,
  };
}
