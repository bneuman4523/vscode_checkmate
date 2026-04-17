import type { KioskBrandingConfig } from "@shared/schema";

interface KioskBrandingHeaderProps {
  branding: KioskBrandingConfig | null;
  eventName: string;
  onLogoTap?: () => void;
  fallbackIcon: React.ReactNode;
  children?: React.ReactNode;
}

export default function KioskBrandingHeader({
  branding,
  eventName,
  onLogoTap,
  fallbackIcon,
  children,
}: KioskBrandingHeaderProps) {
  return (
    <div className="text-center mb-4 sm:mb-6 md:mb-8">
      {branding?.bannerUrl && (
        <div className="mb-4">
          <img
            src={branding.bannerUrl}
            alt={`${eventName} banner`}
            className="w-full max-h-32 object-contain rounded-lg"
          />
        </div>
      )}

      <div
        className={`inline-flex items-center justify-center rounded-full mb-3 sm:mb-4 cursor-pointer select-none overflow-hidden ${
          branding?.logoUrl
            ? "w-16 h-16"
            : "w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-primary"
        }`}
        onClick={onLogoTap}
        data-testid="kiosk-logo"
      >
        {branding?.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={`${eventName} logo`}
            className="w-full h-full object-contain"
          />
        ) : (
          fallbackIcon
        )}
      </div>

      <h1
        className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2"
        data-testid="text-event-name"
      >
        {eventName || "Self Check-In"}
      </h1>
      <p className="text-lg text-muted-foreground">Quick and easy badge printing</p>

      {children}
    </div>
  );
}
