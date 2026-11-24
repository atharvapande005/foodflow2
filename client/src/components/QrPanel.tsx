import { useEffect, useState } from "react";
import { ExternalLink, Download, QrCode } from "lucide-react";
import QRCode from "qrcode";
import type { Canteen } from "@/lib/api";

export default function QrPanel({ canteen }: { canteen: Canteen }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const url = `${window.location.origin}/qr/${canteen.code}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: 520,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#493021", light: "#FFFFFF" },
    })
      .then((value) => {
        if (!cancelled) setDataUrl(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);

  const download = () => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `foodflow-${canteen.code.toLowerCase()}-qr.png`;
    link.click();
  };

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <div>
          <h2>Guest QR ordering</h2>
          <p>
            Print this code and place it on the counter or tables. Guests can order without an account and pay cash
            at the counter.
          </p>
        </div>
        <QrCode size={20} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 22,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="qr-frame">
          {dataUrl ? <img src={dataUrl} alt={`QR code for ${canteen.name}`} /> : <div className="loading">Generating…</div>}
          <b>{canteen.name}</b>
          <span className="qr-url">{url}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="secondary" onClick={download} disabled={!dataUrl}>
            <Download size={15} /> Download QR (PNG)
          </button>
          <a className="secondary upload-label" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Open guest page
          </a>
          <small className="field-hint" style={{ maxWidth: 240 }}>
            The page uses this canteen's branding. QR codes stay valid as long as the canteen code is unchanged.
          </small>
        </div>
      </div>
    </div>
  );
}
