import { failoverFetch } from "@/lib/queryClient";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { Globe, Loader2, Maximize, Minimize, CheckCircle2, AlertCircle } from "lucide-react";
import { useDeviceContext } from "@/lib/device-context";

export default function ServerSetupPage() {
  const [, navigate] = useLocation();
  const { setServerConfig, serverUrl, enterpriseCode, enterpriseId } = useDeviceContext();
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();

  const [url, setUrl] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validatedEnterprise, setValidatedEnterprise] = useState<{ id: string; name: string; code: string } | null>(null);
  const [resolvedBaseUrl, setResolvedBaseUrl] = useState<string | null>(null);

  const isPrivateIp = (hostname: string): boolean => {
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost$)/i.test(hostname);
  };

  const parseServerUrl = (input: string): { baseUrl: string; enterpriseCode: string; needsProtocolProbe: boolean } | null => {
    let cleanInput = input.trim();
    let needsProtocolProbe = false;
    
    if (!cleanInput.startsWith("http://") && !cleanInput.startsWith("https://")) {
      needsProtocolProbe = true;
      const testHostname = cleanInput.split("/")[0].split(":")[0];
      if (isPrivateIp(testHostname)) {
        cleanInput = "http://" + cleanInput;
        needsProtocolProbe = false;
      } else {
        cleanInput = "https://" + cleanInput;
      }
    }
    
    try {
      const urlObj = new URL(cleanInput);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      
      if (pathParts.length === 0) {
        return null;
      }
      
      const enterpriseCode = pathParts[0].toUpperCase();
      const baseUrl = urlObj.origin;
      
      return { baseUrl, enterpriseCode, needsProtocolProbe };
    } catch {
      return null;
    }
  };

  const tryFetchEnterprise = async (baseUrl: string, code: string): Promise<{ ok: boolean; enterprise?: any; status?: number }> => {
    try {
      const response = await fetch(`${baseUrl}/api/enterprises/by-code/${code}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return { ok: false, status: response.status };
      }
      const enterprise = await response.json();
      return { ok: true, enterprise };
    } catch {
      return { ok: false };
    }
  };

  const handleValidate = async () => {
    setError(null);
    setValidatedEnterprise(null);

    const parsed = parseServerUrl(url);
    if (!parsed) {
      setError("Please enter a valid URL with enterprise code (e.g., server.com/BOM)");
      return;
    }

    setIsValidating(true);

    try {
      let result = await tryFetchEnterprise(parsed.baseUrl, parsed.enterpriseCode);

      if (!result.ok && parsed.needsProtocolProbe) {
        const fallbackUrl = parsed.baseUrl.replace("https://", "http://");
        result = await tryFetchEnterprise(fallbackUrl, parsed.enterpriseCode);
        if (result.ok) {
          parsed.baseUrl = fallbackUrl;
        }
      }
      
      if (!result.ok) {
        if (result.status === 404) {
          setError(`Enterprise "${parsed.enterpriseCode}" not found. Please check the code and try again.`);
        } else {
          setError("Failed to connect to server. Please check the URL and try again.");
        }
        return;
      }

      setResolvedBaseUrl(parsed.baseUrl);
      setValidatedEnterprise({
        id: result.enterprise.id,
        name: result.enterprise.name,
        code: result.enterprise.code,
      });
    } catch (err) {
      setError("Failed to connect to server. Please check the URL and try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirm = () => {
    if (!validatedEnterprise || !resolvedBaseUrl) return;

    setServerConfig(resolvedBaseUrl, validatedEnterprise.code, validatedEnterprise.id);
    navigate("/device-type");
  };

  // Only redirect if ALL required server config is present
  if (serverUrl && enterpriseCode && enterpriseId) {
    navigate("/device-type");
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {fullscreenSupported && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            data-testid="button-fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        )}
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Globe className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl font-semibold" data-testid="text-server-setup-title">
            Connect to Server
          </CardTitle>
          <CardDescription>
            Enter the server URL provided by your administrator. This includes the enterprise code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="server-url">Server URL</Label>
            <Input
              id="server-url"
              placeholder="server.yourcompany.com/BOM"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setValidatedEnterprise(null);
                setResolvedBaseUrl(null);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isValidating) {
                  handleValidate();
                }
              }}
              data-testid="input-server-url"
            />
            <p className="text-xs text-muted-foreground">
              Example: pos.example.com/BOM where BOM is your enterprise code
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {validatedEnterprise && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10 p-3 rounded-md">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Connected to <strong>{validatedEnterprise.name}</strong> ({validatedEnterprise.code})</span>
            </div>
          )}

          <div className="flex gap-2">
            {!validatedEnterprise ? (
              <Button
                className="flex-1"
                onClick={handleValidate}
                disabled={!url.trim() || isValidating}
                data-testid="button-validate-server"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            ) : (
              <Button
                className="flex-1"
                onClick={handleConfirm}
                data-testid="button-confirm-server"
              >
                Continue Setup
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Contact your administrator if you don't have a server URL.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
