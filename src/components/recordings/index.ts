/** GHL LIVE — screen recording, video notes and transcription. */

export { ScreenRecorder, QuickRecordButton } from "./ScreenRecorder";
export { RecordingEditor } from "./RecordingEditor";
export { RecordingPlayer, type RecordingRow, type ReplyRow, type Bookmark } from "./RecordingPlayer";
export { RecordingsHub } from "./RecordingsHub";
export { VideoNoteButton, ReplyComposer, ReplyDrawer } from "./VideoNoteButton";
export { TranscriptView, toLines, type Line } from "./TranscriptView";
export {
  RecordingShare,
  defaultShare,
  audienceLabel,
  saveRecording,
  expiryToIso,
  ACCESS_OPTIONS,
  EXPIRY_OPTIONS,
  type ShareValue,
  type ExpiryKey,
  type SaveInput,
} from "./RecordingShare";
export {
  useRecorder,
  captureThumbnail,
  videoDuration,
  pickVideoMime,
  pickAudioMime,
  extForMime,
  speechSupported,
  CAPTURE_MODES,
  MODE_KIND,
  type CaptureMode,
  type RecorderPhase,
  type RecorderResult,
  type TranscriptLine,
} from "./useRecorder";
