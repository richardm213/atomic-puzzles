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
  const [frame] = useState(() => ({
    style: Math.floor(Math.random() * 4),
    reversed: Math.random() < 0.5,
  }));
  const [ready, setReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
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

  const filename = `atomic-puzzles-${bet.marketId}-${bet.username}.png`.replace(
    /[^a-zA-Z0-9._-]/g,
    "-",
  );
  const canShareImage = Boolean(
    imageFile &&
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [imageFile] }),
  );

  useEffect(() => {
    const dialog = pane.current;
    if (!dialog) return;
    dialog.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setImageFile(null);
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
      const outline = new Path2D();
      outline.moveTo(12, 0);
      outline.lineTo(408, 0);
      outline.quadraticCurveTo(420, 0, 420, 12);
      outline.lineTo(420, height - 8);
      for (let tooth = 1; tooth <= 60; tooth++) {
        outline.lineTo(420 - tooth * 7, height - (tooth % 2 === 0 ? 8 : 0));
      }
      outline.lineTo(0, 12);
      outline.quadraticCurveTo(0, 0, 12, 0);
      outline.closePath();
      context.clip(outline);
      context.fillStyle = background;
      context.fillRect(0, 0, 420, height);
      const directions: [number, number, number, number][] = [
        [0, 0, 420, height], // Classic
        [0, 0, 420, 0], // Horizontal
        [0, height, 420, 0], // Ribbon
        [0, 0, 0, height], // Vertical
      ];
      const stops: [number, string][][] = [
        [
          [0, "--color-primary"],
          [0.5, "--color-primary-soft"],
          [1, "--color-cyan"],
        ],
        [
          [0, "--color-primary"],
          [0.55, "--color-cyan"],
          [1, "--color-primary-soft"],
        ],
        [
          [0, "--color-cyan"],
          [0.42, "--color-primary"],
          [0.58, "--color-primary-soft"],
          [1, "--color-primary"],
        ],
        [
          [0, "--color-primary-soft"],
          [0.6, "--color-primary"],
          [1, "--color-cyan"],
        ],
      ];
      const [x, y, endX, endY] = directions[frame.style]!;
      const gradient = frame.reversed
        ? context.createLinearGradient(endX, endY, x, y)
        : context.createLinearGradient(x, y, endX, endY);
      stops[frame.style]!.forEach(([position, token]) =>
        gradient.addColorStop(position, color(token)),
      );
      context.fillStyle = gradient;
      context.fillRect(0, 0, 420, height);
      const inner = new Path2D();
      inner.roundRect(12, 12, 396, height - 24, frame.style === 2 ? 14 : 12);
      context.fillStyle = background;
      context.fill(inner);
      context.strokeStyle = color("--color-border");
      context.lineWidth = 1;
      context.stroke(outline);
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
      // Prepare the file before a click so native sharing retains user activation.
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Image export failed"))),
          "image/png",
        ),
      );
      if (cancelled) return;
      setImageFile(new File([blob], filename, { type: "image/png" }));
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
    frame,
    filename,
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

  const download = () => {
    if (!imageFile || !ready || sharing) return;
    setError("");
    try {
      const url = URL.createObjectURL(imageFile);
      const link = document.createElement("a");
      link.href = url;
      link.download = imageFile.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Unable to download the image. Please try again.");
    }
  };

  const share = async () => {
    if (!imageFile || !ready || !canShareImage || sharing) return;
    setSharing(true);
    setError("");
    try {
      await navigator.share({ files: [imageFile] });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError("Unable to share the image. You can download it instead.");
      }
    } finally {
      setSharing(false);
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
      <div className="betShareSlipActions">
        {canShareImage ? (
          <button
            type="button"
            className="primaryActionButton"
            disabled={!ready || sharing}
            onClick={() => void share()}
          >
            {sharing ? "Sharing…" : "Share image"}
          </button>
        ) : null}
        <button
          type="button"
          className={`betShareSlipDownload${canShareImage ? "" : " primaryActionButton"}`}
          disabled={!ready || sharing}
          onClick={download}
        >
          Download image
        </button>
      </div>
    </dialog>,
    document.body,
  );
};
