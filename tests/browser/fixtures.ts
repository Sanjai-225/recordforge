import type {
  DeveloperSnapshot,
  ParticipantSnapshot,
  PublicSnapshot,
} from "../../src/lib/types";
export function fixtures() {
  const now = new Date().toISOString(),
    event = {
      name: "LLM Chatbot Challenge",
      generation: 1,
      state: "LIVE" as const,
      participant_limit: 120,
      chatbot_limit: 10,
      duration_minutes: 60,
      started_at: now,
      paused_at: null,
      ended_at: null,
      pause_seconds: 0,
      deadline: new Date(Date.now() + 3600000).toISOString(),
      version: 1,
    };
  const person = {
    id: "00000000-0000-4000-8000-000000000101",
    user_id: "00000000-0000-4000-8000-000000000201",
    name: "Demo Builder",
    department: "IT",
    register_number: "20263420",
    event_code: "IT3420",
    additional_data: {},
    enabled: true,
    deleted_at: null,
    version: 1,
  };
  const bot = {
    id: "00000000-0000-4000-8000-000000000301",
    participant_id: person.id,
    sequence: 1,
    title: "CareerMate AI",
    deployment_url: "https://example.com/careermate",
    additional_data: {},
    created_at: now,
    deployed_at: now,
    verified_at: now,
    deleted_at: null,
    version: 3,
    event_code: person.event_code,
    participant_name: person.name,
    department: person.department,
  };
  const metrics = {
    participants: 1,
    submitted: 1,
    deployed: 1,
    completed: 1,
    target: 1200,
  };
  const participant: ParticipantSnapshot = {
    event,
    participant: person,
    username: "demo_builder",
    chatbots: [bot],
    metrics,
    fields: [],
    server_time: now,
    revision: 1,
  };
  const leaderboard = {
    title: "Participant leaderboard",
    subtitle: "Every verified chatbot counts",
    columns: [
      "event_code",
      "name",
      "department",
      "completed",
      "deployed",
      "verified",
      "latest_completion",
    ],
    sort: "completed",
    direction: "desc" as const,
    row_limit: 120,
  };
  const progress = {
    title: "LLM Chatbot World Record Challenge",
    subtitle: "Built together. Counted with confidence.",
    show_timer: true,
    show_percentage: true,
    show_participants: true,
    show_target: true,
    show_progress: true,
    branding: "RecordForge",
  };
  const developer: DeveloperSnapshot = {
    event: {
      ...event,
      id: "00000000-0000-4000-8000-000000000001",
      id_config: {
        prefix: "",
        separator: "",
        register_digits: 4,
        include_department: true,
        use_sequence: false,
      },
      clock: event,
    },
    metrics,
    rows: [],
    total: 0,
    offset: 0,
    page_size: 100,
    configs: { leaderboard, progress },
    fields: [],
    recent_completions: [bot],
    consistency: {
      qualifying_rows: 1,
      participant_sum: 1,
      leaderboard_total: 1,
      master_total: 1,
      consistent: true,
      checked_at: now,
    },
    departments: ["IT"],
    server_time: now,
    revision: 1,
  };
  const display: PublicSnapshot = {
    event,
    metrics,
    rows: [
      {
        event_code: person.event_code,
        name: person.name,
        department: person.department,
        completed: 1,
        deployed: 1,
        verified: 1,
        latest_completion: now,
      },
    ],
    config: progress,
    server_time: now,
    revision: 1,
  };
  return { participant, developer, display, leaderboard, progress };
}
