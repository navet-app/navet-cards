/** Provider-neutral inputs consumed by card presentation. */
export class PermissionDeniedError extends Error {}

export type CardKind = 'light' | 'switch' | 'sensor' | 'room' | 'media' | 'climate' | 'cover' | 'number' | 'select' | 'navigation'
  | 'fan' | 'lock' | 'vacuum' | 'person' | 'weather' | 'scene' | 'script' | 'entity'
  | 'info' | 'note' | 'photo' | 'button' | 'battery' | 'ups' | 'energy-now' | 'media-stack' | 'chips' | 'sub-controls' | 'humidifier' | 'water-heater' | 'remote' | 'update' | 'calendar' | 'composition';
export type Capability =
  | 'update_install' | 'update_skip' | 'update_clear_skipped' | 'remote_activity' | 'toggle' | 'humidity' | 'humidifier_mode' | 'water_operation' | 'away_mode'
  | 'speed' | 'lock' | 'unlock' | 'start' | 'return_home' | 'activate' | 'text'
  | 'brightness'
  | 'play'
  | 'pause'
  | 'media_join' | 'media_unjoin' | 'volume' | 'seek' | 'repeat' | 'shuffle' | 'power_on' | 'power_off'
  | 'temperature'
  | 'position'
  | 'open'
  | 'close'
  | 'stop' | 'number' | 'select' | 'hvac_mode' | 'source' | 'next' | 'previous' | 'mute' | 'color_temperature' | 'color' | 'effect' | 'temperature_range' | 'tilt' | 'tilt_open' | 'tilt_close' | 'tilt_stop' | 'fan_preset' | 'oscillate' | 'direction' | 'climate_preset' | 'climate_fan' | 'climate_swing' | 'climate_swing_horizontal' | 'vacuum_speed';
export type MediaRepeatMode = 'off' | 'one' | 'all';
export type LightColorMode = 'hs' | 'rgb' | 'rgbw' | 'rgbww' | 'xy';
export interface CardEntity {
  id: string;
  externalId: string;
  name: string;
  state: string;
  value: string;
  unit: string;
  available: boolean;
  active: boolean;
  capabilities: Capability[];
  updateInstalledVersion?: string;
  updateLatestVersion?: string;
  updateSkippedVersion?: string;
  updateInProgress?: boolean;
  updatePercentage?: number;
  updateReleaseSummary?: string;
  updateReleaseUrl?: string;
  updateAuto?: boolean;
  remoteActivity?: string;
  remoteActivities?: string[];
  speed?: number;
  climatePreset?: string;
  climatePresets?: string[];
  climateFan?: string;
  climateFans?: string[];
  climateSwing?: string;
  climateSwings?: string[];
  climateSwingHorizontal?: string;
  climateSwingHorizontals?: string[];
  vacuumSpeed?: string;
  vacuumSpeeds?: string[];
  fanPreset?: string;
  fanPresets?: string[];
  oscillating?: boolean;
  direction?: 'forward' | 'reverse';
  directions?: ('forward' | 'reverse')[];
  battery?: number;
  humidity?: number;
  targetHumidity?: number;
  currentHumidity?: number;
  minHumidity?: number;
  maxHumidity?: number;
  stepHumidity?: number;
  humidifierMode?: string;
  humidifierModes?: string[];
  waterOperation?: string;
  waterOperations?: string[];
  awayMode?: boolean;
  deviceClass?: string;
  areaName?: string;
  feelsLike?: number;
  cleanedArea?: number;
  cleaningMinutes?: number;
  forecast?: ForecastDay[];
  textMax?: number;
  textMin?: number;
  secret?: boolean;
  brightness?: number;
  volume?: number;
  temperature?: number;
  targetTemperatureLow?: number;
  targetTemperatureHigh?: number;
  temperatureUnit?: string;
  tiltPosition?: number;
  minTemperature?: number;
  maxTemperature?: number;
  stepTemperature?: number;
  position?: number;
  subtitle?: string;
  currentTemperature?: number;
  climateAction?: string;
  artist?: string;
  artwork?: string;
  duration?: number;
  elapsed?: number;
  mediaPositionUpdatedAt?: number;
  mediaGroupMembers?: string[];
  repeat?: MediaRepeatMode;
  repeatModes?: MediaRepeatMode[];
  shuffle?: boolean;
  number?: number;
  minNumber?: number;
  maxNumber?: number;
  stepNumber?: number;
  options?: string[];
  hvacModes?: string[];
  sources?: string[];
  source?: string;
  muted?: boolean;
  color_temperature?: number;
  color?: { hue: number; saturation: number };
  colorModes?: LightColorMode[];
  effect?: string;
  effects?: string[];
  minKelvin?: number;
  maxKelvin?: number;
}
export interface ForecastDay { time: number; condition: string; high: number; low?: number; }
export interface HistoryPoint { time: number; value: number; }
export type CardCommand =
  | { type: 'update_install' | 'update_skip'; latestVersion: string }
  | { type: 'update_clear_skipped'; skippedVersion: string }
  | { type: 'media_join'; members: string[] }
  | { type: 'media_unjoin' }
  | { type: 'toggle' | 'play_pause' | 'open' | 'close' | 'stop' | 'next' | 'previous' | 'mute' | 'lock' | 'unlock' | 'start' | 'return_home' | 'activate' | 'pause' | 'tilt_open' | 'tilt_close' | 'tilt_stop' | 'power_on' | 'power_off' }
  | { type: 'brightness' | 'volume' | 'temperature' | 'position' | 'number' | 'color_temperature' | 'speed' | 'tilt' | 'seek' | 'humidity'; value: number }
  | { type: 'oscillate' | 'shuffle' | 'away_mode'; value: boolean }
  | { type: 'repeat'; value: MediaRepeatMode }
  | { type: 'temperature_range'; low: number; high: number }
  | { type: 'color'; hue: number; saturation: number }
  | { type: 'remote_activity' | 'select' | 'hvac_mode' | 'source' | 'text' | 'effect' | 'fan_preset' | 'direction' | 'climate_preset' | 'climate_fan' | 'climate_swing' | 'climate_swing_horizontal' | 'vacuum_speed' | 'humidifier_mode' | 'water_operation'; value: string };
