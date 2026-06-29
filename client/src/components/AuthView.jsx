import { Button } from "@cloudflare/kumo";
import { SignIn } from "@phosphor-icons/react";
import { api } from "../api.js";

const ERRORS = {
  access_denied: "Your hrtID account is not allowed to use this mailbox.",
  expired: "That sign-in attempt expired. Please try again.",
  invalid_request: "Sign-in request was invalid. Please try again.",
  signin_failed: "Sign-in failed. Please try again.",
};

export function AuthView() {
  const qs = new URLSearchParams(window.location.search);
  const errCode = qs.get("auth_error");
  const errDetail = qs.get("detail");
  const errMsg = errCode ? ERRORS[errCode] || "Could not sign you in. Please try again." : "";

  return (
    <div className="em-auth">
      <div className="em-auth-split">
        <div className="em-auth-pane">
          <div className="em-auth-mark em-display">estrogen.delivery</div>
          <h1 className="em-auth-title em-display">Mail that is yours.</h1>
          <p className="em-auth-copy">
            Sign in with your hrtID account to reach your @estrogen.delivery inbox.
          </p>
          {errMsg && (
            <div className="em-form-error">
              {errMsg}
              {errDetail && <span className="em-form-error-detail">{errDetail}</span>}
            </div>
          )}
          <Button
            variant="primary"
            size="lg"
            icon={SignIn}
            onClick={() => {
              window.location.href = api.loginUrl;
            }}
          >
            Continue with hrtID
          </Button>
          <p className="em-auth-foot">Fair use applies.</p>
        </div>
        <div className="em-auth-art" aria-hidden="true" />
      </div>
    </div>
  );
}
