import { VisitorRequest } from "@/types/visitor";
import { ALL_DAY_BITMASKS } from "./nlp-config";

export const DEFAULT_BASE_URL = "https://blackhawk-hoa.frontsteps.com";
export const DEFAULT_HOME_ID = "3551675";
export const DEFAULT_USER_ID = "3633290";

export const PASS_TYPE_IDS: Record<string, string> = {
  Guest: "21658",
  Vendor: "21657",
  Delivery: "21658",
};

export function toFrontStepsDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

/**
 * Build the FrontSteps API request body for creating a visitor.
 */
export function buildVisitorBody(
  visitor: VisitorRequest,
  homeId: string = DEFAULT_HOME_ID,
  userId: string = DEFAULT_USER_ID,
) {
  const passTypeId = PASS_TYPE_IDS[visitor.passType] || PASS_TYPE_IDS.Guest;
  const isPermanent = visitor.guestType === "Permanent";

  const startDate = isPermanent ? "" : toFrontStepsDate(visitor.startDate);
  const endDate = isPermanent ? "" : toFrontStepsDate(visitor.endDate || visitor.startDate);

  const daysValues = visitor.daysPermitted && visitor.daysPermitted.length > 0
    ? visitor.daysPermitted
    : ALL_DAY_BITMASKS;
  const daysBitmask = daysValues.reduce((sum, val) => sum + val, 0);

  return {
    dl_home_id: homeId,
    dl_user_id: userId,
    guest: {
      guest_type: visitor.guestType.toLowerCase(),
      first_name: visitor.firstName || "",
      last_name: visitor.lastName || "",
      phone_number: visitor.phone || "",
      email: visitor.email || "",
      start_date: startDate,
      end_date: endDate,
      notes: visitor.attendantNotes || "",
      send_epass: visitor.sendEpass ?? false,
      pass_type_id: passTypeId,
      company: visitor.company || "",
      days_permitted_list: daysValues.map(String),
      days_permitted: daysBitmask,
    },
  };
}
