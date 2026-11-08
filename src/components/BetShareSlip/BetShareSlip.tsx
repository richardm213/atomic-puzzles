import "./BetShareSlip.css";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAppSettings } from "../../context/AppSettings";
import type { BetHistoryEntry } from "../../pages/Betting/bettingHistoryModel";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";

export const BetShareSlip = ({
  bet,
  marketTitle,
  countryCode,
  onClose,
}: {
  bet: BetHistoryEntry;
  marketTitle: string;
  countryCode: string;
  onClose: () => void;
}) => {
  const { colorMode, theme } = useAppSettings();
  const pane = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selection =
    bet.predictionSelectionLabel ??
    (bet.predictionOutcome
      ? `${bet.predictionOutcome === "yes" ? "Yes" : "No"} · ${bet.selection}`
      : bet.selection);
  const odds = `${bet.priceCents.toLocaleString(undefined, { maximumFractionDigits: 1 })}% chance`;
  const cost = `${bet.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} coins`;
  const payout = bet.status === "open" ? bet.potentialPayout : bet.payout;
  const payoutLabel = bet.status === "open" ? "To win" : "Paid out";
  const payoutText = `${payout.toLocaleString(undefined, { maximumFractionDigits: 0 })} coins`;
  const description = `${marketTitle}. ${selection}${countryCode ? ` (${countryCode})` : ""}. Odds ${odds}. Cost ${cost}. ${payoutLabel} ${payoutText}.`;

  useEffect(() => {
    const dialog = pane.current;
    if (!dialog) return;
    dialog.showModal();
    const outside = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dialog.close();
    };
    dialog.addEventListener("click", outside);
    return () => dialog.removeEventListener("click", outside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    const draw = async () => {
      await document.fonts.ready;
      const logo = new Image();
      logo.src = appAssetPath(
        colorMode === "light" && theme === "default"
          ? "/images/brand/atomic-logo-light.png"
          : "/search-favicon.png",
      );
      await logo.decode();
      const flag = countryCode ? new Image() : null;
      if (flag) {
        flag.crossOrigin = "anonymous";
        flag.src = countryCodeToFlagUrl(countryCode);
        await flag.decode().catch(() => undefined);
      }
      const showFlag = flag !== null && flag.naturalWidth > 0;
      if (cancelled || !canvas.current || !pane.current) return;
      const context = canvas.current.getContext("2d");
      if (!context) throw new Error("Unable to create the share image.");
      const styles = getComputedStyle(pane.current);
      const color = (token: string) => styles.getPropertyValue(token).trim();
      const font = color("--font-sans");
      const wrap = (text: string, size: number, weight: number, width: number) => {
        context.font = `${weight} ${size}px ${font}`;
        const lines: string[] = [];
        let line = "";
        for (const word of text.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && context.measureText(candidate).width > width) {
            lines.push(line);
            line = word;
          } else line = candidate;
        }
        if (line) lines.push(line);
        return lines;
      };
      const titleLines = wrap(marketTitle, 19, 600, 304);
      const selectionLines = wrap(selection, 28, 600, showFlag ? 308 : 348);
      const titleY = 56;
      const selectionY = titleY + 16 + titleLines.length * 27;
      const divider = titleY + titleLines.length * 27 + selectionLines.length * 28;
      const bottom = divider + 190;
      const height = bottom + 20;
      canvas.current.width = 840;
      canvas.current.height = height * 2;
      context.scale(2, 2);
      const background = styles.backgroundColor;
      const heading = color("--color-heading");
      const muted = color("--color-muted");
      context.fillStyle = background;
      context.fillRect(0, 0, 420, height);
      // Broad, overlapping pools of color give the exported card depth without
      // placing hard gradient bands behind the bet details.
      const glow = (x: number, y: number, radius: number, token: string, opacity: number) => {
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, color(token));
        gradient.addColorStop(0.35, color(token));
        gradient.addColorStop(1, "transparent");
        context.globalAlpha = opacity;
        context.fillStyle = gradient;
        context.fillRect(0, 0, 420, height);
      };
      const light = colorMode === "light";
      glow(210, -170, 620, "--color-primary", light ? 0.28 : 0.86);
      glow(490, -75, 410, "--color-cyan", light ? 0.18 : 0.65);
      glow(-250, height + 280, 550, "--color-primary-soft", light ? 0.1 : 0.2);
      // A narrow satin reflection across the color field adds a little finish.
      const sheen = context.createLinearGradient(0, 0, 420, height * 0.6);
      sheen.addColorStop(0, "transparent");
      sheen.addColorStop(0.38, "transparent");
      sheen.addColorStop(0.51, color("--color-heading"));
      sheen.addColorStop(0.64, "transparent");
      sheen.addColorStop(1, "transparent");
      context.globalAlpha = light ? 0.025 : 0.035;
      context.fillStyle = sheen;
      context.fillRect(0, 0, 420, height);
      context.globalAlpha = 1;
      const edge = context.createLinearGradient(0, 0, 420, height);
      edge.addColorStop(0, color("--color-primary-soft"));
      edge.addColorStop(0.5, color("--color-border"));
      edge.addColorStop(1, color("--color-cyan"));
      context.strokeStyle = edge;
      context.globalAlpha = light ? 0.3 : 0.45;
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(0.5, 0.5, 419, height - 1, 12);
      context.stroke();
      context.globalAlpha = 1;
      const brand = document.createElement("canvas");
      brand.width = logo.naturalWidth;
      brand.height = logo.naturalHeight;
      const brandContext = brand.getContext("2d");
      if (!brandContext) throw new Error("Unable to create the brand mark.");
      brandContext.drawImage(logo, 0, 0);
      if (theme !== "default") {
        const rgb = (token: string) => {
          brandContext.fillStyle = color(token);
          brandContext.fillRect(0, 0, 1, 1);
          return brandContext.getImageData(0, 0, 1, 1).data;
        };
        const ink = rgb("--brand-mark-color");
        const tile = rgb("--brand-mark-tile");
        brandContext.clearRect(0, 0, brand.width, brand.height);
        brandContext.drawImage(logo, 0, 0);
        const pixels = brandContext.getImageData(0, 0, brand.width, brand.height);
        // Match NavBrandMark's luminance/gamma treatment, using the larger dark source.
        for (let i = 0; i < pixels.data.length; i += 4) {
          const luminance =
            (pixels.data[i]! * 0.2126 +
              pixels.data[i + 1]! * 0.7152 +
              pixels.data[i + 2]! * 0.0722) /
            255;
          const tone = Math.max(0, Math.min(1, luminance * 1.51 - 0.344)) ** 0.88;
          for (let channel = 0; channel < 3; channel++) {
            pixels.data[i + channel] = ink[channel]! * tone + tile[channel]! * (1 - tone);
          }
        }
        brandContext.putImageData(pixels, 0, 0);
      }
      context.drawImage(brand, 36, titleY - 24, 32, 32);
      context.fillStyle = heading;
      context.font = `600 19px ${font}`;
      titleLines.forEach((line, i) => context.fillText(line, 80, titleY + i * 27));
      context.font = `600 28px ${font}`;
      if (showFlag) context.drawImage(flag, 36, selectionY - 20, 28, 20);
      selectionLines.forEach((line, i) =>
        context.fillText(line, showFlag ? 76 : 36, selectionY + i * 28),
      );
      context.strokeStyle = color("--color-border");
      context.beginPath();
      context.moveTo(36, divider + 10);
      context.lineTo(384, divider + 10);
      context.stroke();
      const rows = [
        ["Odds", odds],
        ["Cost", cost],
        [payoutLabel, payoutText],
      ];
      rows.forEach(([label, value], i) => {
        const y = divider + 53 + i * 51;
        context.fillStyle = muted;
        context.textAlign = "left";
        context.font = `400 16px ${font}`;
        context.fillText(label!, 36, y);
        context.textAlign = "right";
        let size = i === 2 ? 27 : 19;
        const weight = i === 2 ? 600 : 500;
        context.font = `${weight} ${size}px ${font}`;
        while (context.measureText(value!).width > 220 && size > 14) {
          context.font = `${weight} ${--size}px ${font}`;
        }
        context.fillStyle =
          i === 2 && (bet.status === "won" || (bet.status === "settled" && payout > bet.totalCost))
            ? color("--color-payout-profit")
            : i === 2 &&
                (bet.status === "lost" || (bet.status === "settled" && payout < bet.totalCost))
              ? color("--color-payout-loss")
              : heading;
        context.fillText(value!, 384, y);
      });
      setReady(true);
    };
    void draw().catch(() => {
      if (!cancelled) setError("Unable to create the share image. Please try again.");
    });
    return () => {
      cancelled = true;
    };
  }, [
    bet,
    colorMode,
    theme,
    marketTitle,
    countryCode,
    selection,
    odds,
    cost,
    payout,
    payoutLabel,
    payoutText,
  ]);

  const download = async () => {
    if (!canvas.current || !ready) return;
    setSaving(true);
    setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Image export failed"))),
          "image/png",
        ),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `atomic-puzzles-${bet.marketId}-${bet.username}.png`.replace(
        /[^a-zA-Z0-9._-]/g,
        "-",
      );
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Unable to download the image. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <dialog ref={pane} className="betShareSlipDialog" aria-label="Share bet" onClose={onClose}>
      <header>
        <h2>Share bet</h2>
        <button type="button" aria-label="Close bet slip" onClick={() => pane.current?.close()}>
          ×
        </button>
      </header>
      <canvas
        ref={canvas}
        className="betShareSlipImage"
        role="img"
        aria-label={description}
        hidden={!ready}
      />
      {!ready && !error ? <p role="status">Preparing image…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        className="primaryActionButton betShareSlipDownload"
        disabled={!ready || saving}
        onClick={() => void download()}
      >
        {saving ? "Downloading…" : "Download image"}
      </button>
    </dialog>,
    document.body,
  );
};
