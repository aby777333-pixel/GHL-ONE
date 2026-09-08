"use client";
/**
 * Icon elements. A curated set of lucide icons (explicit imports — importing the whole pack
 * would balloon the bundle) plus a rasteriser that turns the rendered <svg> into an Image so
 * the canvas renderer and the PNG export can paint it. Colour comes from the CSS tokens.
 */
import * as React from "react";
import {
  AlertTriangle, Award, Bell, Bookmark, Box, Brain, Briefcase, Bug, Building2, Calendar, Check, CheckCircle2,
  Clock, Cloud, Code, Cpu, Database, DollarSign, Eye, Flag, Flame, Folder, Gauge, Gift, Globe, Handshake,
  Heart, Key, Layers, Lightbulb, Link2, Lock, Mail, MapPin, MessageCircle, Package, Phone, PieChart, Rocket,
  Search, Server, Shield, ShoppingCart, Smartphone, Star, Target, ThumbsUp, TrendingUp, Truck, Users, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { iconKey, resolve, type Palette } from "./boardDraw";

export const BOARD_ICONS: Record<string, LucideIcon> = {
  AlertTriangle, Award, Bell, Bookmark, Box, Brain, Briefcase, Bug, Building2, Calendar, Check, CheckCircle2,
  Clock, Cloud, Code, Cpu, Database, DollarSign, Eye, Flag, Flame, Folder, Gauge, Gift, Globe, Handshake,
  Heart, Key, Layers, Lightbulb, Link2, Lock, Mail, MapPin, MessageCircle, Package, Phone, PieChart, Rocket,
  Search, Server, Shield, ShoppingCart, Smartphone, Star, Target, ThumbsUp, TrendingUp, Truck, Users, Wrench, Zap,
};

export const ICON_NAMES = Object.keys(BOARD_ICONS);

function OneIcon({ cacheKey, name, color, onReady }: { cacheKey: string; name: string; color: string; onReady: (k: string, img: HTMLImageElement) => void }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    let alive = true;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "160");
    clone.setAttribute("height", "160");
    clone.setAttribute("stroke", color);
    const markup = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => { if (alive) onReady(cacheKey, img); };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    return () => { alive = false; };
  }, [cacheKey, name, color, onReady]);
  const Comp = BOARD_ICONS[name] || Star;
  return <span ref={ref}><Comp size={160} strokeWidth={1.6} /></span>;
}

/**
 * Rasterise every icon the board currently uses. Render `node` somewhere inside the editor
 * (it is visually hidden) and read the images from the map you passed in.
 */
export function useIconImages(
  wanted: { icon?: string | null; color?: string | null }[],
  palette: Palette,
  images: React.RefObject<Map<string, CanvasImageSource>>,
  onReady: () => void
) {
  const [done, setDone] = React.useState<Record<string, boolean>>({});
  const items = React.useMemo(() => {
    const seen = new Map<string, { cacheKey: string; name: string; color: string }>();
    for (const w of wanted) {
      const k = iconKey(w);
      if (!seen.has(k)) seen.set(k, { cacheKey: k, name: w.icon || "Star", color: resolve(palette, w.color, "fg") });
    }
    return [...seen.values()];
  }, [wanted, palette]);

  const ready = React.useCallback((k: string, img: HTMLImageElement) => {
    images.current.set(k, img);
    setDone((d) => (d[k] ? d : { ...d, [k]: true }));
    onReady();
  }, [images, onReady]);

  const node = items.length ? (
    <div aria-hidden className="absolute left-0 top-0 w-0 h-0 overflow-hidden opacity-0 pointer-events-none">
      {items.map((it) => (
        <OneIcon key={it.cacheKey} cacheKey={it.cacheKey} name={it.name} color={it.color} onReady={ready} />
      ))}
    </div>
  ) : null;

  return { node, done };
}
