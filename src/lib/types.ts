export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type Fields = Record<string, Json>;
export type EventState =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "READY"
  | "LIVE"
  | "PAUSED"
  | "ENDED";
export interface EventClock {
  name: string;
  generation: number;
  state: EventState;
  participant_limit: number;
  chatbot_limit: number;
  duration_minutes: number;
  started_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  pause_seconds: number;
  deadline: string | null;
  version: number;
}
export interface EventSettings extends EventClock {
  id: string;
  id_config: IdConfig;
  clock: EventClock;
}
export interface IdConfig {
  prefix: string;
  separator: string;
  register_digits: number;
  include_department: boolean;
  use_sequence: boolean;
}
export interface FieldDefinition {
  id?: string;
  scope: "registration" | "submission";
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  required: boolean;
  enabled?: boolean;
  show_participant?: boolean;
  show_public?: boolean;
  options: string[];
  position?: number;
}
export interface Participant {
  id: string;
  name: string;
  user_id: string;
  username?: string;
  department: string;
  register_number: string;
  event_code: string;
  additional_data: Fields;
  enabled: boolean;
  deleted_at: string | null;
  version: number;
  completed?: number;
  deployed?: number;
  submitted?: number;
}
export interface Chatbot {
  id: string;
  participant_id: string;
  sequence: number;
  title: string;
  deployment_url: string;
  additional_data: Fields;
  created_at: string;
  deployed_at: string | null;
  verified_at: string | null;
  deleted_at: string | null;
  version: number;
  event_code?: string;
  participant_name?: string;
  department?: string;
}
export interface Metrics {
  participants: number;
  submitted: number;
  deployed: number;
  completed: number;
  target: number;
}
export interface Audit {
  id: number;
  generation: number;
  actor_role: string;
  actor_username: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: Json;
  new_data: Json;
  reason: string;
  server_timestamp: string;
  request_id: string;
}
export interface Consistency {
  qualifying_rows: number;
  participant_sum: number;
  leaderboard_total: number;
  master_total: number;
  consistent: boolean;
  checked_at: string;
}
export interface LeaderboardConfig {
  title: string;
  subtitle: string;
  columns: string[];
  sort: string;
  direction: "asc" | "desc";
  row_limit: number;
}
export interface ProgressConfig {
  title: string;
  subtitle: string;
  show_timer: boolean;
  show_percentage: boolean;
  show_participants: boolean;
  show_target: boolean;
  show_progress: boolean;
  branding: string;
}
export interface SnapshotBase {
  server_time: string;
  revision: number;
}
export interface ParticipantSnapshot extends SnapshotBase {
  event: EventClock;
  participant: Participant;
  username: string;
  chatbots: Chatbot[];
  metrics: Metrics;
  fields: FieldDefinition[];
}
export interface DeveloperSnapshot extends SnapshotBase {
  event: EventSettings;
  metrics: Metrics;
  rows: (Participant | Chatbot | Audit)[];
  total: number;
  offset: number;
  page_size: number;
  configs: { leaderboard: LeaderboardConfig; progress: ProgressConfig };
  fields: FieldDefinition[];
  recent_completions: Chatbot[];
  consistency: Consistency | null;
  departments: string[];
}
export interface PublicSnapshot extends SnapshotBase {
  event: EventClock;
  metrics: Metrics;
  rows: Fields[];
  config: LeaderboardConfig | ProgressConfig;
}
export const columnLabels: Record<string, string> = {
  event_code: "Event ID",
  name: "Participant",
  department: "Department",
  completed: "Completed",
  deployed: "Deployed",
  verified: "Verified",
  latest_completion: "Latest completion",
};
export const transitions: Record<EventState, EventState[]> = {
  DRAFT: ["REGISTRATION_OPEN"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED"],
  REGISTRATION_CLOSED: ["REGISTRATION_OPEN", "READY"],
  READY: ["REGISTRATION_OPEN", "LIVE"],
  LIVE: ["PAUSED", "ENDED"],
  PAUSED: ["LIVE", "ENDED"],
  ENDED: [],
};
