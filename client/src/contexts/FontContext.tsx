/**
 * Font Context - React context for font management in badge designer
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fontLibrary, type FontInfo } from "@/lib/font-library";
import type { CustomFont } from "@shared/schema";

interface FontContextValue {
  fonts: {
    webSafe: FontInfo[];
    google: FontInfo[];
    custom: FontInfo[];
  };
  allFonts: FontInfo[];
  isLoading: boolean;
  loadFont: (family: string) => Promise<boolean>;
  isFontLoaded: (family: string) => boolean;
  refreshFonts: () => void;
  generatePrintFontCSS: (usedFonts: string[]) => string;
  generateGoogleFontsLink: (usedFonts: string[]) => string;
}

const FontContext = createContext<FontContextValue | null>(null);

interface FontProviderProps {
  children: ReactNode;
  customerId?: string;
}

export function FontProvider({ children, customerId }: FontProviderProps) {
  const [fonts, setFonts] = useState<FontContextValue['fonts']>({
    webSafe: [],
    google: [],
    custom: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const { data: customFontsData, refetch: refetchCustomFonts } = useQuery<CustomFont[]>({
    queryKey: ["/api/customers", customerId, "fonts"],
    queryFn: async () => {
      if (!customerId) return [];
      const res = await fetch(`/api/customers/${customerId}/fonts`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId,
  });

  useEffect(() => {
    async function initializeFonts() {
      setIsLoading(true);
      
      await fontLibrary.loadGoogleFonts();
      
      if (customFontsData && customFontsData.length > 0) {
        await fontLibrary.loadCustomFonts(customFontsData);
      }

      setFonts(fontLibrary.getFontsGrouped());
      setIsLoading(false);
    }

    initializeFonts();
  }, [customFontsData]);

  const loadFont = async (family: string): Promise<boolean> => {
    const result = await fontLibrary.ensureFontLoaded(family);
    setFonts(fontLibrary.getFontsGrouped());
    return result;
  };

  const isFontLoaded = (family: string): boolean => {
    return fontLibrary.isFontLoaded(family);
  };

  const refreshFonts = () => {
    refetchCustomFonts();
  };

  const generatePrintFontCSS = (usedFonts: string[]): string => {
    const customFontCSS = fontLibrary.generateFontFaceCSS();
    return customFontCSS;
  };

  const generateGoogleFontsLink = (usedFonts: string[]): string => {
    return fontLibrary.generateGoogleFontsLink(usedFonts);
  };

  const value: FontContextValue = {
    fonts,
    allFonts: fontLibrary.getAllFonts(),
    isLoading,
    loadFont,
    isFontLoaded,
    refreshFonts,
    generatePrintFontCSS,
    generateGoogleFontsLink,
  };

  return (
    <FontContext.Provider value={value}>
      {children}
    </FontContext.Provider>
  );
}

export function useFonts(): FontContextValue {
  const context = useContext(FontContext);
  if (!context) {
    throw new Error("useFonts must be used within a FontProvider");
  }
  return context;
}

export function useFontsOptional(): FontContextValue | null {
  return useContext(FontContext);
}
