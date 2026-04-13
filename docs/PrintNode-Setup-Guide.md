# PrintNode Setup Guide for Checkmate

**Purpose:** Enable cloud-to-local printing for mobile devices and tablets at event venues.

---

## Why PrintNode?

Since Checkmate runs in the cloud, it cannot directly access printers on your local network. PrintNode bridges this gap by:

1. Running a small client application on a computer at your venue
2. Receiving print jobs from Checkmate via the cloud
3. Sending those jobs to your locally connected printer

**Result:** Staff using iPads, Android tablets, or any device can print badges to your venue printer.

---

## Requirements

- A computer at the event venue (Mac or Windows)
- Internet connection on that computer
- Zebra printer connected to that computer (USB or network)
- PrintNode account (free tier available for testing)

---

## Step 1: Create PrintNode Account

1. Go to [https://www.printnode.com](https://www.printnode.com)
2. Click **Sign Up** and create a free account
3. Verify your email address
4. Log in to the PrintNode dashboard

---

## Step 2: Get Your API Key

1. In PrintNode dashboard, click **API Keys** in the left menu
2. Click **Generate API Key**
3. Copy the API key (long string of characters)
4. Save it securely - you'll need it for Checkmate

---

## Step 3: Add API Key to Checkmate

> **For Checkmate Administrators Only**

1. Access your Replit project
2. Go to **Secrets** (lock icon in sidebar)
3. Add a new secret:
   - **Key:** `PRINTNODE_API_KEY`
   - **Value:** [Paste your API key]
4. Restart the application

---

## Step 4: Install PrintNode Client on Event Computer

### For Mac

1. Go to [https://www.printnode.com/download](https://www.printnode.com/download)
2. Download the **Mac** version
3. Open the downloaded `.dmg` file
4. Drag PrintNode to your Applications folder
5. Open PrintNode from Applications
6. Log in with your PrintNode account credentials
7. Grant any requested permissions (accessibility, printing)

### For Windows

1. Go to [https://www.printnode.com/download](https://www.printnode.com/download)
2. Download the **Windows** version
3. Run the installer
4. Follow installation prompts
5. PrintNode will start automatically and appear in system tray
6. Log in with your PrintNode account credentials

---

## Step 5: Connect Your Zebra Printer

### Via USB

1. Connect Zebra printer to computer via USB cable
2. Ensure printer is powered on
3. Wait for computer to recognize printer (may take 30 seconds)
4. PrintNode client will detect it automatically

### Via Network

1. Ensure computer and printer are on same network
2. Add printer to your computer:
   - **Mac:** System Preferences > Printers & Scanners > Add (+) > IP tab > Enter printer IP
   - **Windows:** Settings > Devices > Printers > Add a printer > Add manually > TCP/IP
3. PrintNode client will detect the network printer

---

## Step 6: Verify Printer in PrintNode Dashboard

1. Log in to [https://app.printnode.com](https://app.printnode.com)
2. Click **Printers** in the left menu
3. You should see your printer listed with:
   - **Name:** Your printer name
   - **Status:** Online (green indicator)
4. If printer shows "Offline":
   - Check PrintNode client is running on venue computer
   - Check printer is powered on and connected
   - Try restarting the PrintNode client

---

## Step 7: Configure PrintNode in Checkmate Staff Dashboard

1. Open Checkmate staff dashboard on your device (iPad, tablet, laptop)
2. Tap the **Printer** button in the header
3. Select the **PrintNode** tab
4. You should see your printer in the dropdown
5. Select your printer
6. Click **Test Connection** to verify

---

## Troubleshooting

### Printer Not Appearing in Checkmate

| Issue | Solution |
|-------|----------|
| PrintNode client not running | Open PrintNode app on venue computer |
| Wrong API key | Verify `PRINTNODE_API_KEY` secret in Replit |
| Printer offline | Check printer power and connection |
| Network issues | Verify venue computer has internet |

### Print Job Not Printing

| Issue | Solution |
|-------|----------|
| Queue stuck | Check PrintNode dashboard for errors |
| Wrong printer selected | Verify correct printer in Checkmate settings |
| Paper/ribbon issue | Check printer for hardware problems |
| Client not running | Restart PrintNode client on venue computer |

### Test Print Not Working

1. In PrintNode dashboard, go to **Printers**
2. Click on your printer
3. Click **Print Test Page**
4. If test page prints, issue is with Checkmate config
5. If test page fails, issue is with local printer/client

---

## Event Day Checklist

Before event starts:

- [ ] Venue computer is powered on
- [ ] PrintNode client is running (check system tray)
- [ ] Printer is powered on and has supplies
- [ ] Printer shows "Online" in PrintNode dashboard
- [ ] Test print works from Checkmate staff dashboard

---

## PrintNode Pricing

| Plan | Monthly Cost | Print Jobs |
|------|-------------|------------|
| Free | $0 | 5,000/month |
| Standard | $19 | 50,000/month |
| Professional | $49 | 200,000/month |

For most events, the **Free** tier is sufficient for testing and small events.

---

## Offline Considerations

**Important:** PrintNode requires internet connectivity.

- If venue loses internet, print jobs will queue but not print
- When internet returns, queued jobs will print automatically
- For mission-critical events, consider backup options:
  - Direct USB connection with laptop at check-in station
  - AirPrint/Mopria-compatible printer as backup

---

## Support

- **PrintNode Documentation:** [https://www.printnode.com/docs](https://www.printnode.com/docs)
- **PrintNode Support:** support@printnode.com
- **Checkmate Issues:** Contact your Checkmate administrator

---

## Quick Reference

| Action | Where |
|--------|-------|
| Create PrintNode account | printnode.com |
| Get API key | PrintNode Dashboard > API Keys |
| Add API key to Checkmate | Replit > Secrets > PRINTNODE_API_KEY |
| Download client | printnode.com/download |
| View printer status | PrintNode Dashboard > Printers |
| Configure in Checkmate | Staff Dashboard > Printer > PrintNode tab |

---

*Document updated February 2026*
