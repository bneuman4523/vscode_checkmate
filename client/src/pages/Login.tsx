import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, Phone, Mail, ArrowLeft, Clock } from "lucide-react";
import { formatPhoneNumber, toE164 } from "@/lib/phone-format";
import { resetSessionExpiredFlag } from "@/lib/queryClient";

type LoginStep = 'phone' | 'code' | 'email' | 'email_code';

export default function Login() {
  const { data: bgSettings } = useQuery<{ imageUrl: string | null; backgroundColor: string | null }>({
    queryKey: ["/api/settings/login-background"],
    queryFn: async () => {
      const response = await fetch("/api/settings/login-background");
      if (!response.ok) return { imageUrl: null, backgroundColor: null };
      return response.json();
    },
    staleTime: 60000,
  });
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<LoginStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState("+");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [showTimeoutNotice, setShowTimeoutNotice] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason === "timeout" || reason === "expired") {
      setShowTimeoutNotice(true);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const requestOTPMutation = useMutation({
    mutationFn: async ({ identifier, method }: { identifier: string; method: 'sms' | 'email' }) => {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, method }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send code");
      }
      
      return response.json();
    },
    onSuccess: (_, variables) => {
      setIdentifier(variables.identifier);
      setStep(variables.method === 'email' ? 'email_code' : 'code');
      toast({
        title: "Code sent",
        description: variables.method === 'email' 
          ? "Check your email for the login code." 
          : "Check your phone for the login code.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyOTPMutation = useMutation({
    mutationFn: async ({ identifier, code, method }: { identifier: string; code: string; method: 'sms' | 'email' }) => {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code, method }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Invalid code");
      }
      
      return response.json();
    },
    onSuccess: () => {
      resetSessionExpiredFlag();
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setShowTimeoutNotice(false);
      toast({
        title: "Login successful",
        description: "Welcome back!",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRequestSMSOTP = (e: React.FormEvent) => {
    e.preventDefault();
    const e164 = toE164(phoneNumber);
    if (!e164 || e164.length < 8) {
      toast({
        title: "Phone number required",
        description: "Please enter a valid phone number with country code.",
        variant: "destructive",
      });
      return;
    }
    requestOTPMutation.mutate({ identifier: e164, method: 'sms' });
  };

  const handleRequestEmailOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }
    requestOTPMutation.mutate({ identifier: email, method: 'email' });
  };

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast({
        title: "Code required",
        description: "Please enter the code sent to you.",
        variant: "destructive",
      });
      return;
    }
    const method = step === 'email_code' ? 'email' : 'sms';
    verifyOTPMutation.mutate({ identifier, code, method });
  };

  const handleBack = () => {
    setStep('phone');
    setCode("");
  };

  const handleUseEmailBackup = () => {
    setStep('email');
  };

  const backgroundStyle: React.CSSProperties = {
    ...(bgSettings?.backgroundColor && { backgroundColor: bgSettings.backgroundColor }),
    ...(bgSettings?.imageUrl && {
      backgroundImage: `url(${bgSettings.imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      backgroundRepeat: 'no-repeat',
    }),
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-background p-4"
      style={Object.keys(backgroundStyle).length > 0 ? backgroundStyle : undefined}
    >
      <Card className="w-full max-w-md bg-background/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Checkmate</CardTitle>
          <CardDescription>
            {step === 'phone' && "Enter your phone number to sign in"}
            {step === 'code' && "Enter the code sent to your phone"}
            {step === 'email' && "Enter your email to receive a login code"}
            {step === 'email_code' && "Enter the code sent to your email"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showTimeoutNotice && (
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
              <AlertDescription>
                Your session expired due to inactivity. Please sign in again.
              </AlertDescription>
            </Alert>
          )}
          {step === 'phone' && (
            <form onSubmit={handleRequestSMSOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                    className="pl-10"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter your number with country code (e.g., +1 for US) to receive your login code
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={requestOTPMutation.isPending}
              >
                {requestOTPMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Send Login Code
                  </>
                )}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleUseEmailBackup}
                  className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  Use email instead
                </button>
              </div>
            </form>
          )}

          {/* Step 2: OTP Code Input (SMS) */}
          {step === 'code' && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Enter Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-2xl tracking-widest"
                  maxLength={6}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-center">
                  Enter the 6-digit code sent to {identifier}
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={verifyOTPMutation.isPending || code.length !== 6}
              >
                {verifyOTPMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline flex items-center"
                >
                  <ArrowLeft className="h-3 w-3 mr-1" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => requestOTPMutation.mutate({ identifier, method: 'sms' })}
                  className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                  disabled={requestOTPMutation.isPending}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {/* Email Backup: Email Input */}
          {step === 'email' && (
            <form onSubmit={handleRequestEmailOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We'll send you a one-time code to sign in
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={requestOTPMutation.isPending}
              >
                {requestOTPMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Send Login Code
                  </>
                )}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline flex items-center justify-center"
                >
                  <ArrowLeft className="h-3 w-3 mr-1" />
                  Back to phone login
                </button>
              </div>
            </form>
          )}

          {/* Email Backup: OTP Code Input */}
          {step === 'email_code' && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailCode">Enter Code</Label>
                <Input
                  id="emailCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-2xl tracking-widest"
                  maxLength={6}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-center">
                  Enter the 6-digit code sent to {identifier}
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={verifyOTPMutation.isPending || code.length !== 6}
              >
                {verifyOTPMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline flex items-center"
                >
                  <ArrowLeft className="h-3 w-3 mr-1" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => requestOTPMutation.mutate({ identifier, method: 'email' })}
                  className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                  disabled={requestOTPMutation.isPending}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
