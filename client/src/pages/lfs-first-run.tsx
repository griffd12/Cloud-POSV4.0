import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Server, Loader2, CheckCircle2, AlertCircle, LogIn, Building2, Save } from "lucide-react";
import { useDeviceContext } from "@/lib/device-context";

type WizardStep = "cloud" | "auth" | "property" | "complete";

interface Enterprise {
  id: string;
  name: string;
  code: string;
}

interface Property {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
}

export default function LfsFirstRunPage() {
  const [, navigate] = useLocation();
  const { setServerConfig } = useDeviceContext();
  const [step, setStep] = useState<WizardStep>("cloud");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cloudUrl, setCloudUrl] = useState("");
  const [enterpriseCode, setEnterpriseCode] = useState("");
  const [resolvedBaseUrl, setResolvedBaseUrl] = useState("");
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);

  const parseUrl = (input: string): { baseUrl: string; code: string } | null => {
    let cleaned = input.trim();
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      const hostname = cleaned.split("/")[0].split(":")[0];
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost$)/i.test(hostname)) {
        cleaned = "http://" + cleaned;
      } else {
        cleaned = "https://" + cleaned;
      }
    }
    try {
      const urlObj = new URL(cleaned);
      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;
      return { baseUrl: urlObj.origin, code: parts[0].toUpperCase() };
    } catch {
      return null;
    }
  };

  const handleValidateCloud = async () => {
    setError(null);
    const parsed = parseUrl(cloudUrl);
    if (!parsed) {
      setError("Enter a valid URL with enterprise code (e.g., pos.example.com/BOM)");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/lfs/first-run/validate-cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloudUrl: parsed.baseUrl, enterpriseCode: parsed.code }),
      });
      const data = await res.json();
      if (data.ok && data.enterprise) {
        setResolvedBaseUrl(parsed.baseUrl);
        setEnterpriseCode(parsed.code);
        setEnterprise(data.enterprise);
        setStep("auth");
      } else {
        setError(data.error || "Failed to connect");
      }
    } catch {
      setError("Could not reach the LFS server. Is it running?");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async () => {
    setError(null);
    if (!email || !password) {
      setError("Enter your admin email and password");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/lfs/first-run/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloudUrl: resolvedBaseUrl, email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        const propRes = await fetch("/api/lfs/first-run/properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cloudUrl: resolvedBaseUrl, enterpriseId: enterprise!.id }),
        });
        const propData = await propRes.json();
        if (propData.ok && propData.properties?.length > 0) {
          setProperties(propData.properties);
          if (propData.properties.length === 1) {
            setSelectedPropertyId(propData.properties[0].id);
          }
          setStep("property");
        } else {
          setError("No properties found for this enterprise");
        }
      } else {
        setError(data.error || "Authentication failed");
      }
    } catch {
      setError("Connection error during authentication");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPropertyId || !enterprise) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/lfs/first-run/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloudUrl: resolvedBaseUrl,
          propertyId: selectedPropertyId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.apiKey) setGeneratedApiKey(data.apiKey);
        setStep("complete");
        setServerConfig(resolvedBaseUrl, enterprise.code, enterprise.id);
        setTimeout(() => {
          window.location.href = "/";
        }, 3000);
      } else {
        setError(data.error || "Failed to save configuration");
      }
    } catch {
      setError("Failed to save configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const stepNumber = step === "cloud" ? 1 : step === "auth" ? 2 : step === "property" ? 3 : 4;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Server className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl font-semibold" data-testid="text-lfs-setup-title">
            LFS First-Run Setup
          </CardTitle>
          <CardDescription>
            Configure this Local Failover Server to connect to your cloud POS.
          </CardDescription>
          <div className="flex justify-center gap-2 pt-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-8 h-1 rounded-full ${s <= stepNumber ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === "cloud" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cloud-url">Cloud POS URL</Label>
                <Input
                  id="cloud-url"
                  placeholder="pos.yourcompany.com/BOM"
                  value={cloudUrl}
                  onChange={(e) => { setCloudUrl(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !isLoading) handleValidateCloud(); }}
                  data-testid="input-cloud-url"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your cloud server URL with enterprise code
                </p>
              </div>
              <Button
                className="w-full"
                onClick={handleValidateCloud}
                disabled={!cloudUrl.trim() || isLoading}
                data-testid="button-validate-cloud"
              >
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</> : "Connect to Cloud"}
              </Button>
            </>
          )}

          {step === "auth" && (
            <>
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10 p-3 rounded-md">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Connected to <strong>{enterprise?.name}</strong> ({enterprise?.code})</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Admin Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  data-testid="input-admin-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !isLoading) handleAuth(); }}
                  data-testid="input-admin-password"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setStep("cloud"); setError(null); }} data-testid="button-back-cloud">
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAuth}
                  disabled={!email || !password || isLoading}
                  data-testid="button-authenticate"
                >
                  {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</> : <><LogIn className="w-4 h-4 mr-2" />Sign In</>}
                </Button>
              </div>
            </>
          )}

          {step === "property" && (
            <>
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10 p-3 rounded-md">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Authenticated to <strong>{enterprise?.name}</strong></span>
              </div>
              <Label>Select Property</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {properties.map((prop) => (
                  <div
                    key={prop.id}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedPropertyId === prop.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedPropertyId(prop.id)}
                    data-testid={`property-select-${prop.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{prop.name}</span>
                    </div>
                    {(prop.address || prop.city) && (
                      <p className="text-xs text-muted-foreground ml-6">
                        {[prop.address, prop.city, prop.state].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setStep("auth"); setError(null); }} data-testid="button-back-auth">
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={!selectedPropertyId || isLoading}
                  data-testid="button-save-config"
                >
                  {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save & Start</>}
                </Button>
              </div>
            </>
          )}

          {step === "complete" && (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Setup Complete</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Configuration saved. The LFS will now sync data from the cloud and redirect you to the POS login.
                </p>
              </div>
              {generatedApiKey && (
                <div className="bg-muted p-3 rounded-md text-left space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">LFS API Key (save this):</p>
                  <code className="text-xs break-all select-all" data-testid="text-generated-api-key">{generatedApiKey}</code>
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Redirecting...
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
