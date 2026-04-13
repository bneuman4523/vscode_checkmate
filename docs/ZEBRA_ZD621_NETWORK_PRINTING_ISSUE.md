# Zebra ZD621 Printing Issue - Troubleshooting Report

**Date**: January 9, 2026 (Updated)  
**Printer Model**: Zebra ZD621  
**Printer IP**: 10.0.0.51  
**Issue**: Print jobs complete as "done" but produce no output (both USB and Network)

---

## Summary

Print jobs sent to the Zebra ZD621 via PrintNode complete with status "done" but the printer produces no physical output. This affects **both USB and network printing**.

---

## CRITICAL FINDINGS

### Issue 1: Jobs Sent to Wrong Printer
Log analysis shows test jobs were sent to the **wrong PrintNode printer ID**:

```
[PrintNode] Sending TEST print to printer 75058891  ← EPSON_CW_C4000u (NOT Zebra!)
[PrintNode] Sending PDF job to printer 75058891     ← Same wrong printer
```

**Correct Zebra Printer IDs:**
| Printer Queue | PrintNode ID | Connection |
|---------------|--------------|------------|
| Zebra_ZD621 | **75063172** | Network |
| Zebra_ZD621_usb | **75063714** | USB |

### Issue 2: PDF Format vs ZPL
Badges are being sent as **PDF** (4.3 MB) instead of raw **ZPL**:

```
[PrintNode] Sending PDF job to printer 75058891: "Badge: Monica Schneider" (4324332 bytes base64)
```

The Zebra ZD621 is a thermal label printer optimized for ZPL (Zebra Programming Language). When receiving PDF:
- The CUPS/driver must render PDF → raster image → printer commands
- This conversion may fail silently on label printers
- Results in "done" status but no output

**Recommended**: Send raw ZPL commands directly for reliable printing.

---

## What We've Tested

### 1. PrintNode Cloud Printing
Jobs submitted via PrintNode API complete successfully:

```
[PrintNode] Sending RAW job to printer 75063172: "Test Print" (259 bytes)
[PrintNode] RAW data preview: ^XA
^MMT
^PW406
...
[PrintNode] RAW job created successfully: jobId=7678839683
[PrintNode] Job 7678839683 status check: {
  id: 7678839683,
  state: 'done',
  createTimestamp: '2026-01-09T19:32:40.481Z'
}
```

**Result**: Job marked as "done" but no physical output from printer.

### 2. CUPS Print Queues (Mac)
Multiple CUPS queues were configured to test different approaches:

| Queue Name | PrintNode ID | Protocol | Status |
|------------|--------------|----------|--------|
| Zebra_ZD621 | 75063172 | Network/AppSocket | online |
| zebra_cups | 75063697 | CUPS | online |
| zebra_cups_9100 | 75063698 | Raw TCP port 9100 | online |
| ZebraRaw | 75063706 | Raw | online |
| Zebra_ZD621_usb | 75063714 | USB | online |

**Result**: All queues show as "online" but network queues don't produce output.

### 3. Direct TCP Connection (netcat)
Attempted sending ZPL directly to port 9100:

```bash
echo "^XA^FO50,50^A0N,30,30^FDTest^FS^XZ" | nc 10.0.0.51 9100
```

**Result**: Data appears to be sent (no connection refused), but printer doesn't print.

### 4. USB Printing
USB-connected queue (Zebra_ZD621_usb) works correctly - labels print as expected.

**This confirms the printer hardware is functioning correctly.**

---

## Suspected Root Cause

The printer's **Raw TCP port 9100** appears to be disabled or restricted in the printer's security settings. The printer accepts TCP connections on port 9100 but does not process the data.

---

## Requested Actions for IT/Printer Admin

Please check the following settings on the Zebra ZD621 printer:

### 1. Access Printer Web Interface
Navigate to: `http://10.0.0.51` (or the printer's current IP)

### 2. Check Print Server Settings
Look for:
- **Print Server → Raw TCP** (or "Port 9100")
- Ensure **Raw Port 9100 printing is ENABLED**
- Some printers call this "JetDirect" or "AppSocket" printing

### 3. Check Security / Access Control
Look for:
- **Security → IP Whitelist** or **Allowed Hosts**
- If enabled, add the IP addresses of devices that need to print
- Or disable IP filtering for testing

### 4. Verify Print Language Mode
- Should be set to **ZPL** (not EPL, CPCL, or Line Print)
- Found under: **Printing → Print Language** or similar

### 5. Check Printer Control Language
Navigate to:
- **Device Settings → Programming Language**
- Ensure set to **ZPL II**

### 6. Firmware Version
Please note the current firmware version - there may be known issues with certain versions and raw port printing.

---

## Printer Information Needed

Please provide:

1. **Printer admin password** (if we need to access settings remotely)
2. **Current firmware version**
3. **Screenshot of Print Server settings page** showing port 9100 status
4. **Screenshot of Security settings** showing any IP restrictions
5. **Network info**: Is printer on same VLAN as client devices? Any firewall between them?

---

## Network Verification

From the application server, we can confirm:
- Port 9100 is **reachable** (no connection refused)
- TCP connection **establishes successfully**
- Data **transmits** without error

This strongly indicates the issue is on the printer side (not network/firewall), since:
- A blocked port would refuse connection
- A firewall would timeout
- But we get: connection success → data sent → no output

---

## Alternative Workarounds Available

While waiting for network printing resolution:

1. **USB Printing**: Works via PrintNode when printer is USB-connected to a computer running PrintNode client
2. **PrintNode Cloud**: Works when routing through USB-connected printer
3. **Zebra Browser Print**: Works on Mac/Windows with desktop app installed (USB only)

---

## Contact

For questions about this report or additional testing, please reach out to the development team.
