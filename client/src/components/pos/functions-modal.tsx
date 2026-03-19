import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowRightLeft, 
  Split, 
  Merge, 
  RotateCcw, 
  DollarSign, 
  Grid3X3,
  Lock,
  Activity,
  FileEdit,
  BarChart3,
  Zap,
  LockOpen,
  Database,
} from "lucide-react";
import { SystemStatusModal } from "./system-status-modal";
import { CAPSDiagnosticModal } from "./caps-diagnostic-modal";

interface WorkstationInfo {
  name: string;
  ipAddress?: string | null;
}

interface FunctionsModalProps {
  open: boolean;
  onClose: () => void;
  hasActiveCheck: boolean;
  onTransferCheck: () => void;
  onSplitCheck: () => void;
  onMergeChecks: () => void;
  onReopenCheck: () => void;
  onEditClosedCheck: () => void;
  onPriceOverride: () => void;
  onAssignTable: () => void;
  onOpenReports?: () => void;
  onStressTest?: () => void;
  onOpenDrawer?: () => void;
  cashDrawerEnabled?: boolean;
  privileges: {
    canTransfer: boolean;
    canSplit: boolean;
    canMerge: boolean;
    canReopen: boolean;
    canPriceOverride: boolean;
  };
  propertyId?: string;
  workstation?: WorkstationInfo | null;
}

interface FunctionButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  locked?: boolean;
  variant?: "default" | "secondary" | "destructive";
}

function FunctionButton({ 
  icon, 
  label, 
  description, 
  onClick, 
  disabled, 
  locked,
  variant = "secondary" 
}: FunctionButtonProps) {
  return (
    <div className="h-24">
      <Button
        variant={variant}
        className="w-full h-full flex flex-col items-center justify-center gap-1 relative"
        onClick={onClick}
        disabled={disabled || locked}
        data-testid={`button-fn-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {locked && (
          <Lock className="w-3 h-3 absolute top-2 right-2 text-muted-foreground" />
        )}
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold">{label}</span>
        </div>
        <span className="text-xs text-muted-foreground">{description}</span>
      </Button>
    </div>
  );
}

export function FunctionsModal({
  open,
  onClose,
  hasActiveCheck,
  onTransferCheck,
  onSplitCheck,
  onMergeChecks,
  onReopenCheck,
  onEditClosedCheck,
  onPriceOverride,
  onAssignTable,
  onOpenReports,
  onStressTest,
  onOpenDrawer,
  cashDrawerEnabled,
  privileges,
  propertyId,
  workstation,
}: FunctionsModalProps) {
  const [showSystemStatus, setShowSystemStatus] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  return (
    <>
    <SystemStatusModal 
      open={showSystemStatus} 
      onClose={() => setShowSystemStatus(false)} 
      propertyId={propertyId}
      workstation={workstation}
    />
    <CAPSDiagnosticModal
      open={showDiagnostic}
      onClose={() => setShowDiagnostic(false)}
    />
    
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5" />
            Functions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Check Control</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FunctionButton
                icon={<ArrowRightLeft className="w-5 h-5" />}
                label="Transfer Check"
                description="Move to another employee"
                onClick={onTransferCheck}
                disabled={!hasActiveCheck}
                locked={!privileges.canTransfer}
              />
              <FunctionButton
                icon={<Split className="w-5 h-5" />}
                label="Split Check"
                description="Divide items to new check"
                onClick={onSplitCheck}
                disabled={!hasActiveCheck}
                locked={!privileges.canSplit}
              />
              <FunctionButton
                icon={<Merge className="w-5 h-5" />}
                label="Merge Checks"
                description="Combine multiple checks"
                onClick={onMergeChecks}
                disabled={!hasActiveCheck}
                locked={!privileges.canMerge}
              />
              <FunctionButton
                icon={<RotateCcw className="w-5 h-5" />}
                label="Reopen Check"
                description="Reopen a closed check"
                onClick={onReopenCheck}
                locked={!privileges.canReopen}
              />
              <FunctionButton
                icon={<FileEdit className="w-5 h-5" />}
                label="Edit Closed Check"
                description="Void payment & repay"
                onClick={onEditClosedCheck}
                locked={!privileges.canReopen}
              />
              <FunctionButton
                icon={<Grid3X3 className="w-5 h-5" />}
                label="Assign Table"
                description="Set or change table"
                onClick={onAssignTable}
                disabled={!hasActiveCheck}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Item Control</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FunctionButton
                icon={<DollarSign className="w-5 h-5" />}
                label="Price Override"
                description="Change item price"
                onClick={onPriceOverride}
                disabled={!hasActiveCheck}
                locked={!privileges.canPriceOverride}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Reports</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FunctionButton
                icon={<BarChart3 className="w-5 h-5" />}
                label="Reports"
                description="View sales reports"
                onClick={() => onOpenReports?.()}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">System</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FunctionButton
                icon={<Activity className="w-5 h-5" />}
                label="System Status"
                description="View connectivity status"
                onClick={() => setShowSystemStatus(true)}
              />
              <FunctionButton
                icon={<Database className="w-5 h-5" />}
                label="CAPS Diagnostic"
                description="View sync & data health"
                onClick={() => setShowDiagnostic(true)}
              />
              <FunctionButton
                icon={<Zap className="w-5 h-5" />}
                label="Stress Test"
                description="Automated POS load test"
                onClick={() => onStressTest?.()}
                variant="secondary"
              />
              {cashDrawerEnabled && (
                <FunctionButton
                  icon={<LockOpen className="w-5 h-5" />}
                  label="Open Drawer"
                  description="Open cash drawer manually"
                  onClick={() => onOpenDrawer?.()}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-close-functions">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
