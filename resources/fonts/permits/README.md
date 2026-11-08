Metric-compatible, freely redistributable (SIL OFL) stand-ins for the Microsoft fonts the permit
template uses, so LibreOffice wraps text the same way Excel does:

- Carlito  → Calibri
- Caladea  → Cambria

LibreOffice is pointed at this folder by PermitPdfConverter (see fontConfigFile()).
Times New Roman / Arial map to Liberation Serif / Sans, which ship with most Linux systems
(Debian/Ubuntu: apt install fonts-liberation).
