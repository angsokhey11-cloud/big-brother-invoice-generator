# BIG BROTHER — Native Invoice Workstation (Windows test build)

This is an **independent optional Windows test client** for our existing Invoice Generator, not an update to the live Cloud/Local invoice or accounting code.

## Why native?
Telegram Web refuses cross-site iframe embedding. The ordinary browser popup inside our website cannot bypass that. This test version hosts two real Microsoft Edge WebView2 browser surfaces, one for the Invoice Generator URL and another for the floating external website. Telegram is loaded as a top-level webpage, not in an iframe.

The browser has a circular top-right minimize/restore control, draggable title, resize corner, URL navigation, Telegram shortcut and bookmarks. Hiding the panel leaves its original WebView2 instance alive. Windows stores browser cookies/login under the device-local BrowserProfile folder, separate from the InvoiceProfile and Chrome. Websites can still expire or revoke sessions.

The deployed Invoice Generator webpage has not been edited for this native build. The old iframe bubble is hidden only by a small CSS script inside the native Invoice WebView2.

## Build on Windows

Install .NET 10 SDK and WebView2 Runtime. From repo root run:

    dotnet publish windows-workstation/BBInvoiceWorkstation.csproj -c Release -r win-x64 --self-contained true -o out/InvoiceWorkstation

Then run BIG-BROTHER-Invoice-Workstation.exe in the published folder. The GitHub Actions workflow builds it on a Windows runner and uploads a zipped Windows package.

## Safety
**Completing an invoice inside this test app can write real transactions to Cloud/Local.** Do NOT complete any invoices for this trial. No DB, accounting, invoice save, SQL, stock, bank or A/R functions are modified by the build. Test account logins and Telegram compatibility on your actual Windows device before relying on it.

Browser sessions are in %LOCALAPPDATA%\BIG BROTHER\Invoice Workstation Test V1\BrowserProfile. Treat that directory as sensitive; do not share it. Neither external websites nor invoice pages receive C# host objects. Device preference URLs are stored without query strings or fragments. This test client has no installer or signing and is not production-ready.

## Files
Project folder: windows-workstation/
Windows CI: .github/workflows/build-native-invoice-workstation.yml
Read START-HERE.txt before testing.
