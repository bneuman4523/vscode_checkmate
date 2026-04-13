/**
 * Font Library - Dynamic font loading and management for badge printing
 * 
 * Features:
 * - Load web-safe fonts (always available)
 * - Load Google Fonts via CDN
 * - Load custom fonts from base64 data via FontFace API
 * - Font caching and preloading
 * - High-resolution print font embedding
 */

import { WEB_SAFE_FONTS, GOOGLE_FONTS, type CustomFont } from "@shared/schema";

export interface FontInfo {
  id?: string;
  family: string;
  displayName: string;
  category: string;
  weight?: string;
  style?: string;
  source: 'web-safe' | 'google' | 'custom';
  loaded?: boolean;
}

interface FontLibraryState {
  webSafeFonts: FontInfo[];
  googleFonts: FontInfo[];
  customFonts: FontInfo[];
  loadedFonts: Set<string>;
  customFontData: Map<string, string>; // family -> base64 data
}

class FontLibrary {
  private state: FontLibraryState = {
    webSafeFonts: [],
    googleFonts: [],
    customFonts: [],
    loadedFonts: new Set(),
    customFontData: new Map(),
  };

  private googleFontsLoaded = false;

  constructor() {
    this.initializeWebSafeFonts();
    this.initializeGoogleFonts();
  }

  private initializeWebSafeFonts() {
    this.state.webSafeFonts = WEB_SAFE_FONTS.map(font => ({
      family: font.family,
      displayName: font.displayName,
      category: font.category,
      source: 'web-safe' as const,
      loaded: true,
    }));
  }

  private initializeGoogleFonts() {
    this.state.googleFonts = GOOGLE_FONTS.map(font => ({
      family: font.family,
      displayName: font.displayName,
      category: font.category,
      weight: font.weights.join(','),
      source: 'google' as const,
      loaded: false,
    }));
  }

  /**
   * Load Google Fonts via CDN
   */
  async loadGoogleFonts(): Promise<void> {
    if (this.googleFontsLoaded) return;

    const families = GOOGLE_FONTS.map(font => 
      `${font.family.replace(/ /g, '+')}:wght@${font.weights.join(';')}`
    ).join('&family=');

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    document.head.appendChild(link);

    await new Promise<void>((resolve) => {
      link.onload = () => {
        this.googleFontsLoaded = true;
        this.state.googleFonts.forEach(font => {
          font.loaded = true;
          this.state.loadedFonts.add(font.family);
        });
        resolve();
      };
      link.onerror = () => {
        console.warn('Failed to load Google Fonts');
        resolve();
      };
    });
  }

  /**
   * Load a single Google Font on demand
   */
  async loadGoogleFont(family: string): Promise<boolean> {
    const fontInfo = this.state.googleFonts.find(f => f.family === family);
    if (!fontInfo) return false;
    if (fontInfo.loaded) return true;

    const googleFont = GOOGLE_FONTS.find(f => f.family === family);
    if (!googleFont) return false;

    const familyParam = `${family.replace(/ /g, '+')}:wght@${googleFont.weights.join(';')}`;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
    document.head.appendChild(link);

    return new Promise<boolean>((resolve) => {
      link.onload = () => {
        fontInfo.loaded = true;
        this.state.loadedFonts.add(family);
        resolve(true);
      };
      link.onerror = () => {
        console.warn(`Failed to load Google Font: ${family}`);
        resolve(false);
      };
    });
  }

  /**
   * Load custom fonts from API response
   */
  async loadCustomFonts(customFonts: CustomFont[]): Promise<void> {
    const previousCustomFamilies = this.state.customFonts.map(f => f.family);
    this.state.customFonts = [];
    
    for (const familyName of previousCustomFamilies) {
      const isStillPresent = customFonts.some(f => f.fontFamily === familyName);
      if (!isStillPresent) {
        document.fonts.forEach(face => {
          if (face.family === familyName) {
            document.fonts.delete(face);
          }
        });
      }
    }
    
    for (const font of customFonts) {
      await this.loadCustomFont(font);
    }
  }

  /**
   * Load a single custom font using FontFace API
   */
  async loadCustomFont(font: CustomFont): Promise<boolean> {
    try {
      const fontFace = new FontFace(
        font.fontFamily,
        `url(data:${font.mimeType};base64,${font.fontData})`,
        {
          weight: font.fontWeight,
          style: font.fontStyle,
        }
      );

      await fontFace.load();
      document.fonts.add(fontFace);

      this.state.customFonts.push({
        id: font.id,
        family: font.fontFamily,
        displayName: font.displayName,
        category: 'custom',
        weight: font.fontWeight,
        style: font.fontStyle,
        source: 'custom',
        loaded: true,
      });

      this.state.loadedFonts.add(font.fontFamily);
      this.state.customFontData.set(font.fontFamily, font.fontData);

      return true;
    } catch (error) {
      console.error(`[FontLibrary] Failed to load custom font: ${font.displayName}`, error);
      return false;
    }
  }

  /**
   * Get all available fonts
   */
  getAllFonts(): FontInfo[] {
    return [
      ...this.state.webSafeFonts,
      ...this.state.googleFonts,
      ...this.state.customFonts,
    ];
  }

  /**
   * Get fonts grouped by source
   */
  getFontsGrouped(): {
    webSafe: FontInfo[];
    google: FontInfo[];
    custom: FontInfo[];
  } {
    return {
      webSafe: this.state.webSafeFonts,
      google: this.state.googleFonts,
      custom: this.state.customFonts,
    };
  }

  /**
   * Check if a font is loaded
   */
  isFontLoaded(family: string): boolean {
    return this.state.loadedFonts.has(family);
  }

  /**
   * Ensure a font is loaded before use
   */
  async ensureFontLoaded(family: string): Promise<boolean> {
    if (this.isFontLoaded(family)) return true;

    // Check if it's a web-safe font
    const webSafe = this.state.webSafeFonts.find(f => f.family === family);
    if (webSafe) return true;

    // Check if it's a Google font
    const googleFont = this.state.googleFonts.find(f => f.family === family);
    if (googleFont) {
      return this.loadGoogleFont(family);
    }

    // Custom font should already be loaded
    return false;
  }

  /**
   * Get base64 data for a custom font (for embedding in print)
   */
  getCustomFontData(family: string): string | undefined {
    return this.state.customFontData.get(family);
  }

  /**
   * Generate CSS @font-face declarations for custom fonts
   * Used for embedding in print iframe
   */
  generateFontFaceCSS(): string {
    let css = '';
    
    for (const font of this.state.customFonts) {
      const fontData = this.state.customFontData.get(font.family);
      if (!fontData) continue;

      css += `
        @font-face {
          font-family: '${font.family}';
          src: url(data:font/woff2;base64,${fontData}) format('woff2');
          font-weight: ${font.weight || 'normal'};
          font-style: ${font.style || 'normal'};
          font-display: block;
        }
      `;
    }

    return css;
  }

  /**
   * Generate Google Fonts import link for print
   */
  generateGoogleFontsLink(usedFamilies: string[]): string {
    const googleFamilies = usedFamilies.filter(family => 
      this.state.googleFonts.some(f => f.family === family)
    );

    if (googleFamilies.length === 0) return '';

    const families = googleFamilies.map(family => {
      const font = GOOGLE_FONTS.find(f => f.family === family);
      if (!font) return family.replace(/ /g, '+');
      return `${family.replace(/ /g, '+')}:wght@${font.weights.join(';')}`;
    }).join('&family=');

    return `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
  }

  /**
   * Wait for all fonts to be ready
   */
  async waitForFontsReady(): Promise<void> {
    await document.fonts.ready;
  }

  /**
   * Preload fonts used in a badge template
   */
  async preloadTemplateFonts(mergeFields: Array<{ fontFamily?: string }>): Promise<void> {
    const families = new Set<string>();
    
    for (const field of mergeFields) {
      if (field.fontFamily) {
        families.add(field.fontFamily);
      }
    }

    const familiesArray = Array.from(families);
    for (const family of familiesArray) {
      await this.ensureFontLoaded(family);
    }
  }
}

export const fontLibrary = new FontLibrary();
