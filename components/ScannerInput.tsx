"use client";

type ScannerInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onScan: (value: string) => void;
  autoFocus?: boolean;
};

export function ScannerInput({ label, value, onChange, onScan, autoFocus }: ScannerInputProps) {
  return (
    <label>
      {label}
      <input
        autoComplete="off"
        autoFocus={autoFocus}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onScan(event.currentTarget.value.trim());
          }
        }}
      />
    </label>
  );
}
