import { handleApi } from "./api.js";
import { handleEmail } from "./mail.js";
import { error } from "./util.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, ctx);
      } catch (e) {
        return error(500, "internal error", { detail: String(e?.message || e) });
      }
    }
    return env.ASSETS.fetch(request);
  },

  async email(message, env, ctx) {
    try {
      await handleEmail(message, env, ctx);
    } catch (e) {
      console.error("email handler error", e?.stack || e);
      message.setReject("451 4.3.0 Temporary processing error");
    }
  },
};
