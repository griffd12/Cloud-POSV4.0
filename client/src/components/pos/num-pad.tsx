import { Button } from "@/components/ui/button";
import { Delete, X } from "lucide-react";

interface NumPadProps {
  onDigit: (digit: string) => void;
  onDecimal?: () => void;
  onBackspace: () => void;
  onClear: () => void;
  showDecimal?: boolean;
}

export function NumPad({
  onDigit,
  onDecimal,
  onBackspace,
  onClear,
  showDecimal = true,
}: NumPadProps) {
  const buttons = [
    { label: "1", action: () => onDigit("1") },
    { label: "2", action: () => onDigit("2") },
    { label: "3", action: () => onDigit("3") },
    { label: "4", action: () => onDigit("4") },
    { label: "5", action: () => onDigit("5") },
    { label: "6", action: () => onDigit("6") },
    { label: "7", action: () => onDigit("7") },
    { label: "8", action: () => onDigit("8") },
    { label: "9", action: () => onDigit("9") },
    ...(showDecimal
      ? [{ label: ".", action: () => onDecimal?.() }]
      : [{ label: "", action: () => {} }]),
    { label: "0", action: () => onDigit("0") },
  ];

  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="numpad">
      {buttons.map((btn, i) =>
        btn.label === "" ? (
          <div key={i} />
        ) : (
          <Button
            key={btn.label}
            type="button"
            variant="outline"
            className="h-12 text-lg font-semibold min-w-[48px]"
            onClick={btn.action}
            data-testid={`numpad-btn-${btn.label === "." ? "decimal" : btn.label}`}
          >
            {btn.label}
          </Button>
        )
      )}
      <Button
        type="button"
        variant="outline"
        className="h-12 col-span-2"
        onClick={onBackspace}
        data-testid="numpad-btn-backspace"
      >
        <Delete className="w-5 h-5 mr-1" />
        Back
      </Button>
      <Button
        type="button"
        variant="destructive"
        className="h-12"
        onClick={onClear}
        data-testid="numpad-btn-clear"
      >
        <X className="w-4 h-4 mr-1" />
        Clear
      </Button>
    </div>
  );
}
