import { marketAdminRoute } from "../features/marketAdmin/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(marketAdminRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to administer prediction markets.",
});
