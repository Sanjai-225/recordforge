export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
const messages: Record<string, string> = {
  REGISTER_EXISTS: "This register number is already registered. Please log in.",
  USERNAME_EXISTS: "This username is already taken.",
  EVENT_ID_COLLISION:
    "This Event ID is already assigned. Ask the developer to resolve the ID rule or department before registering.",
  NOT_AUTHORIZED:
    "You do not have access. Your account may be disabled or the event has been reset.",
  INVALID_CREDENTIALS: "Username or password is incorrect.",
  REGISTRATION_CLOSED: "Registration is currently closed.",
  PARTICIPANT_LIMIT: "The participant limit has been reached.",
  CHATBOT_LIMIT: "Maximum chatbot limit reached.",
  EVENT_NOT_LIVE: "Chatbot changes are available only while the event is live.",
  EVENT_EXPIRED:
    "The event time has ended. Participant changes are now closed.",
  DEPLOY_FIRST: "Confirm deployment before verifying this chatbot.",
  RECORD_LOCKED:
    "Deployment has been confirmed. Contact a developer for corrections.",
  STALE_VERSION:
    "This record changed in another session. Synchronize and review it before trying again.",
  STALE_GENERATION:
    "The event was reset. Refresh and sign in to the current event.",
  REQUEST_CONFLICT:
    "This request has already been used for different data. Synchronize before continuing.",
  RESERVATION_EXPIRED:
    "This registration attempt expired. Start a new registration attempt.",
  CONFIG_CONFLICT: "This change conflicts with existing event data.",
  TIMER_CONFIG_LOCKED:
    "Duration is locked after the event starts. Prepare a clean event to change it.",
  ID_CONFIG_LOCKED: "Event ID rules are locked during and after the event.",
  FIELDS_LOCKED:
    "Field definitions are locked while the event is live or paused.",
  REASON_REQUIRED: "Enter a reason of at least three characters.",
  CONFIRMATION_REQUIRED: "Enter the exact confirmation phrase.",
  END_EVENT_BEFORE_RESET: "End the event before performing a reset.",
  CLEAR_SUBMISSIONS_FIRST:
    "Reset chatbot submissions before resetting the timer.",
  RESTORE_SEQUENCE_CONFLICT:
    "This chatbot slot is occupied or exceeds the limit. Resolve the conflicting slot before restoring.",
  RESTORE_PARTICIPANT_FIRST: "Restore the participant first.",
  FUTURE_TIMESTAMP: "Official correction timestamps cannot be in the future.",
  INVALID_TRANSITION: "This state transition is not allowed.",
  REQUIRED_FIELD: "Complete all required event fields.",
  UNKNOWN_FIELD:
    "The registration or submission fields changed. Refresh and try again.",
  INVALID_FIELDS: "Check the additional fields and try again.",
  INVALID_CONFIG: "Check the configuration values.",
  NOT_FOUND: "This record is no longer available.",
  RATE_LIMITED: "Too many attempts. Wait a minute and try again.",
  SETUP_REQUIRED:
    "Application setup is incomplete. Contact the event developer.",
  INVALID_ORIGIN:
    "The request could not be verified. Reload this page and try again.",
  NETWORK:
    "Connection interrupted. Synchronizing will check whether your action succeeded.",
  UNAVAILABLE: "The service is temporarily unavailable. Please try again.",
  INVALID_INPUT: "Please check the form values.",
  INVALID_REGISTRATION: "Please check the registration details.",
};
export function publicError(error: unknown): {
  message: string;
  code: string;
  status: number;
} {
  const item = error as { message?: string; code?: string; status?: number };
  const code =
    item instanceof AppError
      ? item.code
      : (Object.keys(messages).find((k) => item?.message === k) ??
        (item?.code === "23505"
          ? "REQUEST_CONFLICT"
          : item?.code === "23514" ||
              item?.code === "23502" ||
              item?.code === "22P02"
            ? "INVALID_INPUT"
            : "UNAVAILABLE"));
  return {
    code,
    message: messages[code] || messages.UNAVAILABLE,
    status:
      item instanceof AppError
        ? item.status
        : code === "NOT_AUTHORIZED"
          ? 403
          : code === "UNAVAILABLE"
            ? 503
            : 409,
  };
}
