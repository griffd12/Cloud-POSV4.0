# Cloud POS v1.4.11 Release Notes

## Bug Fixes

### Windows USB Printer - Print Spooler API Fix
- **Fixed**: USB printer printing fails with "Could not find file '\\.\USB001'"
  - Root cause: Previous approach tried to open the USB port directly as a file via `FileStream`, but Windows USB printer ports (e.g., USB001) are not raw device paths that can be opened as files — unlike COM ports or network sockets
  - Fix: Replaced direct FileStream port access with the proper **Windows Print Spooler API** using P/Invoke calls to `winspool.drv`:
    - `OpenPrinter` → opens printer by its Windows name
    - `StartDocPrinter` → begins a RAW document
    - `StartPagePrinter` → starts a page
    - `WritePrinter` → sends raw ESC/POS bytes directly to the printer
    - `EndPagePrinter` / `EndDocPrinter` / `ClosePrinter` → cleanup
  - This is the standard Microsoft-recommended method for sending raw data to any Windows printer (USB, network, or virtual)
- **Impact**: USB receipt printing and cash drawer kick now work correctly via the Windows Print Spooler

## Upgrade Notes
- Auto-update from v1.4.10 via electron-updater
- No database migration required
- No configuration changes needed
