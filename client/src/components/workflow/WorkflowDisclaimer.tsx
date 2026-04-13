import { useRef, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Eraser, Check } from "lucide-react";
import type { EventDisclaimer } from "@shared/schema";

interface WorkflowDisclaimerProps {
  disclaimer: EventDisclaimer;
  signatureData: string | null;
  onSignatureChange: (disclaimerId: string, signatureData: string) => void;
  disabled?: boolean;
  showValidationError?: boolean;
}

export function WorkflowDisclaimer({
  disclaimer,
  signatureData,
  onSignatureChange,
  disabled = false,
  showValidationError = false,
}: WorkflowDisclaimerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(!!signatureData);
  const [hasSignature, setHasSignature] = useState(!!signatureData);
  const canvasInitializedRef = useRef(false);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (canvasInitializedRef.current && !signatureData) {
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (signatureData && signatureData !== 'agreed') {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        setHasSignature(true);
      };
      img.src = signatureData;
    }
    
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    canvasInitializedRef.current = true;
  }, [signatureData]);
  
  const getCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);
  
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    
    const coords = getCoordinates(e);
    if (!coords) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  }, [disabled, getCoordinates]);
  
  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    
    const coords = getCoordinates(e);
    if (!coords) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  }, [isDrawing, disabled, getCoordinates]);
  
  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setHasSignature(true);
    
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      if (hasAgreed) {
        onSignatureChange(disclaimer.id, dataUrl);
      }
    }
  }, [isDrawing, hasAgreed, disclaimer.id, onSignatureChange]);
  
  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    
    setHasSignature(false);
    onSignatureChange(disclaimer.id, '');
  }, [disclaimer.id, onSignatureChange]);
  
  const handleAgreementChange = useCallback((checked: boolean) => {
    setHasAgreed(checked);
    
    if (checked && !disclaimer.requireSignature) {
      onSignatureChange(disclaimer.id, 'agreed');
    } else if (checked && hasSignature) {
      const canvas = canvasRef.current;
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        onSignatureChange(disclaimer.id, dataUrl);
      }
    } else if (!checked) {
      onSignatureChange(disclaimer.id, '');
    }
  }, [hasSignature, disclaimer.id, disclaimer.requireSignature, onSignatureChange]);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-disclaimer-title">{disclaimer.title}</CardTitle>
        <CardDescription>Please read carefully and sign below to continue.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ScrollArea className="h-48 rounded-md border p-4">
          <div 
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: disclaimer.disclaimerText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\n/g, '<br/>') }}
          />
        </ScrollArea>
        
        <div className={`flex items-start space-x-3 p-3 rounded-md border transition-colors ${showValidationError && !hasAgreed ? 'border-destructive bg-destructive/5' : 'border-transparent'}`}>
          <Checkbox
            id="agreement"
            data-testid="checkbox-disclaimer-agreement"
            checked={hasAgreed}
            onCheckedChange={handleAgreementChange}
            disabled={disabled}
            className={showValidationError && !hasAgreed ? 'border-destructive' : ''}
          />
          <div className="space-y-1">
            <Label 
              htmlFor="agreement"
              className="text-sm font-normal leading-relaxed cursor-pointer"
            >
              {disclaimer.confirmationText}
            </Label>
            {showValidationError && !hasAgreed && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Please check this box to continue
              </p>
            )}
          </div>
        </div>
        
        {disclaimer.requireSignature && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Your Signature</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSignature}
                disabled={disabled}
                data-testid="button-clear-signature"
              >
                <Eraser className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
            
            <div className="border rounded-md overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                data-testid="canvas-signature"
                className="w-full h-[150px] cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            
            {!hasSignature && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Please sign in the box above using your mouse or finger.
              </p>
            )}
            
            {hasSignature && hasAgreed && (
              <p className="text-sm text-green-600 flex items-center gap-2">
                <Check className="h-4 w-4" />
                Signature captured successfully.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
