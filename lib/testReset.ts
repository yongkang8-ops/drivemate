export function isTestResetEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DRIVEMATE_REPOSITORY === "supabase") return false;
  return true;
}
