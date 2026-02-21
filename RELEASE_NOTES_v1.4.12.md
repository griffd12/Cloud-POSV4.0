# Cloud POS v1.4.12 Release Notes

**Release Date:** February 21, 2026

## Cash Drawer Reliability Overhaul

This release delivers a comprehensive fix for cash drawer kick reliability on Windows workstations, implementing a dual-kick strategy and proper workstation identification across all POS operations.

### Cash Drawer - Dual Kick Strategy
- **Embedded ESC/POS kick bytes** are now included directly in the receipt data, ensuring the drawer opens as part of the print job itself
- **Standalone DRAWER_KICK WebSocket message** is sent after successful auto-print as a backup, providing explicit logging and a second trigger
- **ESC/POS command ordering fix**: Cash drawer kick command now fires BEFORE the paper cut command — Star/ESC/POS printers discard data after a cut
- **Pin wiring correction**: Uses pin2 (0x00) for Cash Drawer 1 instead of pin5, matching standard cash drawer wiring
- **Standalone kick guard**: DRAWER_KICK only fires when auto-print succeeds, preventing kicks on print failures
- **No property-wide fallback**: Standalone kick targets the workstation's own agent only, preventing wrong-device kicks

### Print Agent Improvements
- **Byte-level ESC/POS scanning**: Print agent now detects and logs drawer kick bytes (0x1B 0x70) in print jobs for Windows-side visibility
- **Windows Print Spooler support**: USB printers now use WritePrinter/OpenPrinter via winspool.drv P/Invoke instead of FileStream
- **Detailed kick logging**: Both embedded and standalone kicks produce clear log entries on the Windows workstation

### Workstation Identification Fix
- **Server-side fix**: Separates `realWorkstationId` (raw header value) from `workstationId` (fallback) for proper workstation lookup during payment processing
- **Frontend `wsHeaders()` helper**: All 29 API calls from the POS screen (payment, void, discount, transfer, split, merge, print, lock, reopen, loyalty, etc.) now include the `x-workstation-id` header
- Ensures the correct workstation is identified for drawer kick, auto-print routing, and device configuration lookup

### Multiple Cash Drawer Support
- Workstation configuration now supports two cash drawer outputs (pin2 and pin5)
- Cash drawer enable/disable and auto-open flags are respected per-workstation from EMC configuration

---

**Upgrade Instructions:** Download and run the installer. The update will replace the existing installation automatically. No database changes required.
