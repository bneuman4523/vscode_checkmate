import { Info, Ruler, Type, QrCode, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface BadgeTemplateInfoProps {
  templateName?: string;
  width?: number;
  height?: number;
  fontFamily?: string;
  includeQR?: boolean;
  qrEmbedType?: string;
  participantTypes?: string[];
  layoutMode?: string;
}

export default function BadgeTemplateInfo({
  templateName,
  width,
  height,
  fontFamily,
  includeQR,
  qrEmbedType,
  participantTypes,
  layoutMode,
}: BadgeTemplateInfoProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Template Details
          </p>
          {templateName && (
            <InfoRow icon={<Info className="h-3 w-3" />} label="Template" value={templateName} />
          )}
          {width && height && (
            <InfoRow icon={<Ruler className="h-3 w-3" />} label="Size" value={`${width}" × ${height}"`} />
          )}
          {fontFamily && (
            <InfoRow icon={<Type className="h-3 w-3" />} label="Font" value={fontFamily} />
          )}
          {layoutMode && (
            <InfoRow icon={<Info className="h-3 w-3" />} label="Layout" value={layoutMode === 'foldable' ? 'Two-sided foldable' : 'Single-sided'} />
          )}
          {includeQR !== undefined && (
            <InfoRow
              icon={<QrCode className="h-3 w-3" />}
              label="QR Code"
              value={includeQR ? (qrEmbedType || "Enabled") : "Disabled"}
            />
          )}
          {participantTypes && participantTypes.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Palette className="h-3 w-3" />
                <span className="text-[10px] uppercase tracking-wider">Types</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {participantTypes.map((type) => (
                  <span
                    key={type}
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">{label}</span>
        <span className="text-xs font-medium truncate block">{value}</span>
      </div>
    </div>
  );
}
