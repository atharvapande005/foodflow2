# Receipt printing

FoodFlow prints token receipts in two ways: a built-in browser receipt (works everywhere, no setup) and direct Epson ESC/POS printing (needs hardware plus a local bridge).

## 1. Browser receipt (default, supported)

Every order row on the owner order queue and cash counter has a **Receipt** button. It opens the token receipt dialog and calls the browser print dialog.

- The receipt layout is fixed to 80 mm thermal paper (72 mm printable width).
- `@media print` hides the rest of the app and prints only the receipt, so no background or sidebar appears.
- It works with any printer installed in the operating system, including Epson TM-T82/TM-T88 and similar thermal printers.

### Recommended printer setup on Windows

1. Install the Epson Advanced Printer Driver (APD) for your model.
2. In **Printers & scanners → your printer → Printing preferences**, set:
   - Paper size: `80 x 297 mm` (or a custom 80 mm roll),
   - Margins: none / 0 mm,
   - Speed/quality: standard.
3. In the browser print dialog choose the thermal printer, 80 mm paper, margins **None**, and disable headers/footers.
4. For silent printing, launch the browser with kiosk printing flags or use a small local print service. Browsers cannot bypass the print dialog from normal web JavaScript.

This path is tested through the app's print dialog; actual output depends on the driver and paper.

## 2. Direct Epson ESC/POS printing (optional, hardware-dependent)

Direct printing skips the browser dialog but requires code that runs on the counter machine, because a web page cannot open a raw USB or network socket to the printer.

### Option A — Network printer (recommended)

Most Epson TM-series printers accept ESC/POS over TCP port `9100`.

1. Give the printer a fixed LAN IP, for example `192.168.1.50`.
2. Run a tiny local bridge (Node, Python or the Epson ePOS SDK) on the counter PC that listens on `http://localhost:9101/print`.
3. The bridge converts the order JSON into ESC/POS bytes and writes them to `192.168.1.50:9100`.
4. Add a **Print directly** button in the owner UI that posts the same order payload to the bridge. Keep the browser receipt as the fallback.

The bridge is outside this repository because it needs the printer's address and the counter machine's OS. A minimal Node sketch:

```js
import net from "node:net";
import express from "express";

const app = express();
app.use(express.json());

app.post("/print", (req, res) => {
  const { canteenName, token, orderNumber, items, total } = req.body;
  const lines = [
    "\x1B\x40",                 // init
    "\x1B\x61\x01",             // centre
    `${canteenName}\n`,
    "\x1D\x21\x11",             // double width/height
    `#${String(token).padStart(3, "0")}\n`,
    "\x1D\x21\x00",             // normal
    `${orderNumber}\n\n`,
    "\x1B\x61\x00",             // left
    ...items.map((i) => `${i.name} x${i.quantity}  ${i.price * i.quantity}\n`),
    `\nTOTAL ${total}\n\n\n`,
    "\x1D\x56\x00",             // cut
  ];

  const socket = net.connect(9100, "192.168.1.50", () => {
    socket.write(Buffer.from(lines.join(""), "binary"));
    socket.end();
  });
  socket.on("error", () => res.status(502).json({ error: "Printer unreachable" }));
  socket.on("close", () => res.json({ ok: true }));
});

app.listen(9101, "127.0.0.1");
```

### Option B — USB printer

- **Windows:** share the printer and print to the shared queue, or use Epson's `ePOS-Print` / `TM-T88 Command Emulator` tools. A local service can shell out to `print /D:PRINTER_NAME file.bin`.
- **Linux/Raspberry Pi:** write ESC/POS bytes directly to `/dev/usb/lp0` or a CUPS raw queue (`lp -d EPSON_TM -o raw file.bin`).
- **Android tablet counter:** use Epson's ePOS SDK for Android or a Bluetooth/USB printing plugin in a wrapped app.

### What to configure

| Setting | Example | Where |
| ------- | ------- | ----- |
| Printer IP | `192.168.1.50` | Printer network settings |
| Raw port | `9100` | Bridge |
| Paper width | 80 mm (72 mm printable) | Printer driver / ESC/POS layout |
| Bridge URL | `http://localhost:9101/print` | Owner UI direct-print button |

Direct printing is **not enabled by default** because it needs the printer model, connection type and counter machine. The browser receipt remains fully functional without any of this.
