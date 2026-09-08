"use client";
/** Device selection + data saver (§10, §153, §155, §156). */
import * as React from "react";
import { Camera, Gauge, Mic, Sparkles, Volume2 } from "lucide-react";
import { Button, Field, Modal, Select, useToast } from "@/components/ui";
import type { BandwidthMode } from "@/lib/live/types";
import type { DeviceState } from "./useLiveKit";

const BANDWIDTH: { key: BandwidthMode; label: string; hint: string }[] = [
  { key: "normal", label: "Best quality", hint: "Full video for everyone." },
  { key: "low", label: "Low resolution", hint: "Smaller video — better on weak connections." },
  { key: "saver", label: "Data saver", hint: "Low resolution and your camera stays off." },
  { key: "audio_only", label: "Audio only", hint: "No incoming or outgoing video at all." },
];

export function DevicePicker({
  open,
  onClose,
  devices,
  onSwitch,
  onRefresh,
  bandwidth,
  onBandwidth,
  blurOn,
  onBlur,
  canBlur = true,
}: {
  open: boolean;
  onClose: () => void;
  devices: DeviceState;
  onSwitch: (kind: MediaDeviceKind, id: string) => Promise<boolean>;
  onRefresh: () => void;
  bandwidth: BandwidthMode;
  onBandwidth: (m: BandwidthMode) => void;
  blurOn: boolean;
  onBlur: (on: boolean) => Promise<{ ok: boolean; reason?: string }>;
  canBlur?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const label = (d: MediaDeviceInfo, fallback: string) => d.label || `${fallback} ${d.deviceId.slice(0, 4)}`;

  return (
    <Modal open={open} onClose={onClose} title="Audio, video & bandwidth" width={520}>
      <div className="space-y-[var(--s3)]">
        <Field label="Microphone" hint="Noise suppression and echo cancellation are always on.">
          <Select
            value={devices.activeMic || ""}
            onChange={(e) => void onSwitch("audioinput", e.target.value)}
            disabled={!devices.mics.length}
          >
            {!devices.mics.length && <option value="">No microphone found</option>}
            {devices.mics.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{label(d, "Microphone")}</option>
            ))}
          </Select>
        </Field>

        <Field label="Camera">
          <Select value={devices.activeCam || ""} onChange={(e) => void onSwitch("videoinput", e.target.value)} disabled={!devices.cams.length}>
            {!devices.cams.length && <option value="">No camera found</option>}
            {devices.cams.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{label(d, "Camera")}</option>
            ))}
          </Select>
        </Field>

        <Field label="Speaker" hint={devices.speakers.length ? undefined : "This browser does not let apps choose the speaker."}>
          <Select value={devices.activeSpeaker || ""} onChange={(e) => void onSwitch("audiooutput", e.target.value)} disabled={!devices.speakers.length}>
            {!devices.speakers.length && <option value="">System default</option>}
            {devices.speakers.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{label(d, "Speaker")}</option>
            ))}
          </Select>
        </Field>

        {canBlur && (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5"><Sparkles size={14} /> Blur my background</div>
              <div className="text-[11px] text-muted">Keeps your room private. Not available on every device.</div>
            </div>
            <Button
              size="sm"
              variant={blurOn ? "primary" : "secondary"}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const r = await onBlur(!blurOn);
                setBusy(false);
                if (!r.ok) toast.push(r.reason || "Background blur is not available here", "danger");
              }}
            >
              {blurOn ? "On" : "Off"}
            </Button>
          </div>
        )}

        <Field label="Bandwidth" hint="Switch down when the call gets choppy — nobody has to leave the room.">
          <div className="grid gap-1.5">
            {BANDWIDTH.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => onBandwidth(b.key)}
                className={`flex items-start gap-2 text-left rounded-[var(--radius-sm)] border px-3 py-2 ${bandwidth === b.key ? "border-[var(--brand-2)] bg-[var(--info-bg)]" : "hover:bg-[var(--neutral-bg)]"}`}
              >
                <Gauge size={14} className="mt-0.5 text-muted shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{b.label}</span>
                  <span className="block text-[11px] text-muted">{b.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><Mic size={11} /> {devices.mics.length}</span>
          <span className="inline-flex items-center gap-1"><Camera size={11} /> {devices.cams.length}</span>
          <span className="inline-flex items-center gap-1"><Volume2 size={11} /> {devices.speakers.length || "default"}</span>
          <button type="button" className="ml-auto underline" onClick={onRefresh}>Refresh devices</button>
        </div>
      </div>
    </Modal>
  );
}
